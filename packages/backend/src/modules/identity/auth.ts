import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  freshSessionMiddleware,
  sensitiveSessionMiddleware,
} from "better-auth/api";
import { and, count, eq, gt, isNull, like } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { z } from "zod";
import type { Database, DatabaseTransaction } from "../../db/index.js";
import { logger } from "../../logger.js";
import {
  confirmRestriction,
  recordIdentityRestriction,
} from "../lifecycle/identity-restrictions.js";
import type {
  IdentityRestriction,
  RestrictionJournal,
} from "../lifecycle/restriction-journal.js";
import { auditEvents, restrictionEvents } from "../lifecycle/schema.js";
import { authOptions } from "./auth-options.js";
import * as authSchema from "./auth-schema.js";
import {
  authLinkAge,
  enqueueIdentityMail,
  identityMailQueue,
} from "./email.js";
import { accounts } from "./schema.js";
import {
  canResetCredentials,
  epochSigningSecret,
  identityAccount,
  identityEpoch,
  identityIsCurrent,
  scopeIdentity,
} from "./state.js";

const basePath = authOptions.basePath;
const verificationReturn = "/account?verification=confirmed";
const resetReturn = "/account/reset";
const getPaths = new Set(["/ok", "/get-session", "/verify-email", "/devices"]);
const postPaths = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-out",
  "/send-verification-email",
  "/request-password-reset",
  "/reset-password",
  "/devices/revoke",
]);
const mailPaths = new Set([
  "/sign-up/email",
  "/send-verification-email",
  "/request-password-reset",
]);

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status });
}

class AuthResponse extends Error {
  constructor(readonly response: Response) {
    super("Authentication did not complete");
  }
}

interface AuthConfiguration {
  baseURL: string;
  secret: string;
  epoch: string;
  boss: PgBoss;
  mailKey?: string;
  journal?: RestrictionJournal;
}

export function createAuth(db: Database, config: AuthConfiguration) {
  const publicOrigin = new URL(config.baseURL).origin;
  const digest = identityEpoch(config.epoch);
  const secret = epochSigningSecret(config.secret, config.epoch);

  async function handle(request: Request, requestId?: string) {
    const url = new URL(request.url);
    const path = url.pathname.slice(basePath.length);
    const allowed =
      request.method === "GET"
        ? getPaths.has(path) || /^\/reset-password\/[A-Za-z0-9]{24}$/.test(path)
        : request.method === "POST" && postPaths.has(path);
    if (!allowed)
      return errorResponse(
        404,
        "NOT_FOUND",
        "Authentication route unavailable.",
      );

    let body: Record<string, unknown> = {};
    if (request.method === "POST" && request.body) {
      if (
        request.headers.get("content-type")?.split(";")[0] !==
        "application/json"
      ) {
        return errorResponse(
          400,
          "INVALID_REQUEST",
          "Expected a JSON request.",
        );
      }
      const decoded = await request
        .clone()
        .json()
        .catch(() => null);
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
        return errorResponse(
          400,
          "INVALID_REQUEST",
          "Invalid authentication request.",
        );
      }
      body = decoded as Record<string, unknown>;
    }
    const destinations = [
      ...url.searchParams.getAll("callbackURL"),
      ...url.searchParams.getAll("redirectTo"),
      ...["callbackURL", "redirectTo"]
        .filter((key) => key in body)
        .map((key) => body[key]),
    ];
    const returnPath =
      path.startsWith("/reset-password") || path === "/request-password-reset"
        ? resetReturn
        : verificationReturn;
    if (
      destinations.some(
        (destination) =>
          destination !== returnPath &&
          destination !== `${publicOrigin}${returnPath}`,
      )
    ) {
      return errorResponse(
        400,
        "INVALID_RETURN",
        "This return destination is unavailable.",
      );
    }
    if (mailPaths.has(path)) {
      if (
        !config.mailKey ||
        !(await config.boss.getQueue(identityMailQueue).catch(() => null))
      ) {
        return errorResponse(
          503,
          "EMAIL_UNAVAILABLE",
          "Email is temporarily unavailable. Try again later.",
        );
      }
    }

    let event: IdentityRestriction | undefined;
    try {
      const response = await db.transaction(async (tx) => {
        if (!(await identityIsCurrent(tx, digest))) {
          throw new AuthResponse(
            errorResponse(
              503,
              "RECOVERY_REQUIRED",
              "Account access is temporarily unavailable.",
            ),
          );
        }
        await lockAccountForCredentials(tx, path, body, url);
        let mailFailed = false;
        const auth = requestAuth(
          tx,
          (restriction) => {
            event = restriction;
          },
          () => {
            mailFailed = true;
          },
        );
        const response = await auth.handler(request);
        if (mailFailed) {
          throw new AuthResponse(
            errorResponse(
              503,
              "EMAIL_UNAVAILABLE",
              "Email is temporarily unavailable. Try again later.",
            ),
          );
        }
        if (!response.ok && response.status >= 400)
          throw new AuthResponse(response);
        if (path === "/get-session" && response.ok) {
          const data = (await response.clone().json()) as {
            user?: { id?: string };
            session?: { id?: string };
          } | null;
          if (data?.user?.id && data.session?.id) {
            if (
              !(await identitySessionIsCurrent(
                tx,
                data.user.id,
                data.session.id,
              ))
            )
              return Response.json(null);
          }
        }
        return response;
      });
      if (!event) return response;

      const eventId = event.id;
      if (config.journal) {
        try {
          await confirmRestriction(db, config.journal, eventId);
          return Response.json({
            status: true,
            eventId,
            confirmation: "confirmed",
          });
        } catch {
          logger.warn(
            { requestId, eventId },
            "Identity restriction awaits confirmation",
          );
        }
      }
      return Response.json(
        { status: true, eventId, confirmation: "pending" },
        { status: 202 },
      );
    } catch (error) {
      if (error instanceof AuthResponse) {
        if (error.response.status < 500) return error.response;
        logger.warn({ requestId }, "Authentication transaction failed");
        return errorResponse(
          503,
          "AUTH_UNAVAILABLE",
          "Authentication is temporarily unavailable. Try again later.",
        );
      }
      logger.error({ requestId }, "Authentication transaction failed");
      return errorResponse(
        503,
        "AUTH_UNAVAILABLE",
        "Authentication is temporarily unavailable. Try again later.",
      );
    }
  }

  function requestAuth(
    tx: DatabaseTransaction,
    onRestriction: (event: IdentityRestriction) => void,
    onMailFailure: () => void,
  ) {
    const saveLink = async (
      kind: "verify" | "reset",
      user: { id: string; emailVerified: boolean },
      link: { url: string; token: string },
    ) => {
      let account = await identityAccount(tx, user.id);
      if (!account && kind === "verify") {
        [account] = await tx
          .insert(accounts)
          .values({ id: user.id })
          .onConflictDoNothing()
          .returning();
      }
      if (
        !account ||
        (kind === "verify" && account.restrictedAt) ||
        (kind === "reset" &&
          (!user.emailVerified || !canResetCredentials(account)))
      )
        return;
      if (!config.mailKey) throw new Error("Identity email is unavailable.");
      const url = new URL(link.url);
      url.searchParams.set(
        "callbackURL",
        `${publicOrigin}${kind === "verify" ? verificationReturn : resetReturn}`,
      );
      await enqueueIdentityMail(
        tx,
        config.boss,
        config.mailKey,
        digest,
        kind,
        user.id,
        { url: url.href, token: link.token },
      ).catch((error: unknown) => {
        onMailFailure();
        throw error;
      });
    };

    return betterAuth({
      ...authOptions,
      baseURL: publicOrigin,
      secret,
      database: drizzleAdapter(tx, { provider: "pg", schema: authSchema }),
      trustedOrigins: ["kairn://"],
      plugins: [
        expo(),
        {
          id: "kairn-devices",
          endpoints: {
            devices: createAuthEndpoint(
              "/devices",
              { method: "GET", use: [sensitiveSessionMiddleware] },
              async (ctx) => {
                const current = ctx.context.session;
                await requireCurrentSession(
                  tx,
                  current.user.id,
                  current.session.id,
                );
                const devices = await tx
                  .select({
                    id: authSchema.session.id,
                    createdAt: authSchema.session.createdAt,
                    expiresAt: authSchema.session.expiresAt,
                  })
                  .from(authSchema.session)
                  .where(
                    and(
                      eq(authSchema.session.userId, current.user.id),
                      gt(authSchema.session.expiresAt, new Date()),
                    ),
                  );
                const [pending] = await tx
                  .select({ total: count() })
                  .from(restrictionEvents)
                  .innerJoin(
                    auditEvents,
                    eq(auditEvents.id, restrictionEvents.auditEventId),
                  )
                  .where(
                    and(
                      eq(auditEvents.targetId, current.user.id),
                      isNull(restrictionEvents.journalSequence),
                    ),
                  );
                return ctx.json({
                  currentDeviceId: current.session.id,
                  devices,
                  pendingRestrictions: pending.total,
                });
              },
            ),
            revokeDevice: createAuthEndpoint(
              "/devices/revoke",
              {
                method: "POST",
                use: [freshSessionMiddleware],
                body: z.object({ id: z.uuid() }),
              },
              async (ctx) => {
                const current = ctx.context.session;
                await requireCurrentSession(
                  tx,
                  current.user.id,
                  current.session.id,
                );
                if (ctx.body.id === current.session.id)
                  throw new APIError("BAD_REQUEST", {
                    message: "Use sign out to end this session.",
                  });
                const [removed] = await tx
                  .delete(authSchema.session)
                  .where(
                    and(
                      eq(authSchema.session.userId, current.user.id),
                      eq(authSchema.session.id, ctx.body.id),
                    ),
                  )
                  .returning({ id: authSchema.session.id });
                if (!removed)
                  throw new APIError("NOT_FOUND", {
                    message: "Session unavailable.",
                  });
                onRestriction(
                  await recordIdentityRestriction(
                    tx,
                    config.boss,
                    current.user.id,
                    {
                      operation: "device_session_revoked",
                      sessionId: removed.id,
                    },
                  ),
                );
                return ctx.json({ status: true });
              },
            ),
          },
        },
      ],
      emailAndPassword: {
        ...authOptions.emailAndPassword,
        sendResetPassword: async ({ user, url, token }) =>
          saveLink("reset", user, { url, token }),
        onPasswordReset: async ({ user }) => {
          const account = await identityAccount(tx, user.id);
          if (!account || !canResetCredentials(account) || !user.emailVerified)
            throw new APIError("FORBIDDEN", {
              message: "Account recovery is unavailable.",
            });
          if (account.credentialRecovery === "approved") {
            await tx
              .update(accounts)
              .set({ restrictedAt: null, credentialRecovery: null })
              .where(eq(accounts.id, user.id));
          }
          await tx
            .delete(authSchema.verification)
            .where(
              and(
                eq(authSchema.verification.value, user.id),
                like(authSchema.verification.identifier, "reset-password:%"),
              ),
            );
          onRestriction(
            await recordIdentityRestriction(tx, config.boss, user.id, {
              operation: "credentials_changed",
              sessionId: null,
            }),
          );
        },
      },
      emailVerification: {
        sendOnSignUp: true,
        expiresIn: authLinkAge,
        autoSignInAfterVerification: false,
        sendVerificationEmail: async ({ user, url, token }) =>
          saveLink("verify", user, { url, token }),
      },
      databaseHooks: {
        user: {
          create: {
            after: async (user) => {
              await scopeIdentity(tx, user.id);
              await tx
                .insert(accounts)
                .values({ id: user.id })
                .onConflictDoNothing();
            },
          },
        },
        session: {
          create: {
            before: async (session) => {
              await requireActiveIdentity(tx, session.userId);
            },
          },
        },
      },
    });
  }

  return {
    async handler(request: Request, requestId?: string) {
      const result = await handle(request, requestId);
      const headers = new Headers(result.headers);
      headers.set("Cache-Control", "private, no-store");
      headers.set("Referrer-Policy", "no-referrer");
      return new Response(result.body, { headers, status: result.status });
    },
  };
}

async function lockAccountForCredentials(
  tx: DatabaseTransaction,
  path: string,
  body: Record<string, unknown>,
  url: URL,
) {
  if (
    (path === "/sign-in/email" || path === "/request-password-reset") &&
    typeof body.email === "string"
  ) {
    const [user] = await tx
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.email, body.email.toLowerCase()));
    if (user) await identityAccount(tx, user.id);
  }
  if (path === "/reset-password") {
    const token = body.token ?? url.searchParams.get("token");
    if (typeof token !== "string") return;
    const [pending] = await tx
      .select({ id: authSchema.verification.value })
      .from(authSchema.verification)
      .where(eq(authSchema.verification.identifier, `reset-password:${token}`));
    if (pending) await identityAccount(tx, pending.id);
  }
}

async function requireActiveIdentity(tx: DatabaseTransaction, id: string) {
  const account = await identityAccount(tx, id);
  if (!account || account.restrictedAt)
    throw new APIError("FORBIDDEN", {
      message: "Account access is unavailable.",
    });
}

async function identitySessionIsCurrent(
  tx: DatabaseTransaction,
  id: string,
  sessionId: string,
) {
  const account = await identityAccount(tx, id);
  if (!account || account.restrictedAt) return false;
  const [session] = await tx
    .select({ id: authSchema.session.id })
    .from(authSchema.session)
    .where(
      and(
        eq(authSchema.session.id, sessionId),
        eq(authSchema.session.userId, id),
        gt(authSchema.session.expiresAt, new Date()),
      ),
    );
  return session !== undefined;
}

async function requireCurrentSession(
  tx: DatabaseTransaction,
  id: string,
  sessionId: string,
) {
  if (!(await identitySessionIsCurrent(tx, id, sessionId))) {
    throw new APIError("UNAUTHORIZED", { message: "Session unavailable." });
  }
}
