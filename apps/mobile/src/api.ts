import { createApiClient } from "@kairn/contracts";

export function createMobileApiClient(baseUrl: string) {
  return createApiClient({ baseUrl });
}

export function createInvitationExchangeClient(
  origin: string,
  send: NativeFetch,
) {
  return createApiClient({
    baseUrl: origin,
    fetch: (request) =>
      send(request, {
        headers: request.headers,
        credentials: "omit",
        redirect: "error",
        signal: request.signal,
      }),
  });
}

export type NativeFetch = (
  request: Request,
  init: Pick<RequestInit, "headers" | "credentials" | "redirect" | "signal">,
) => Promise<Response>;

export function ensureActive(signal?: AbortSignal) {
  if (signal?.aborted) {
    const error = new Error("The request is no longer active.");
    error.name = "AbortError";
    throw error;
  }
}

export function createAuthenticatedMobileApiClient({
  origin,
  accountId,
  lifetime,
  getCookie,
  send,
  canWrite = () => true,
}: {
  origin: string;
  accountId: string;
  lifetime: AbortSignal;
  getCookie: () => Promise<string>;
  send: NativeFetch;
  canWrite?: () => boolean;
}) {
  return createApiClient({
    baseUrl: origin,
    async fetch(request) {
      ensureActive(lifetime);
      ensureActive(request.signal);
      if (new URL(request.url).origin !== origin)
        throw new Error("API requests must use the configured origin.");

      const controller = new AbortController();
      const abort = () => controller.abort();
      lifetime.addEventListener("abort", abort);
      request.signal?.addEventListener("abort", abort);
      try {
        const cookie = await getCookie();
        ensureActive(controller.signal);
        if (
          request.method !== "GET" &&
          request.method !== "HEAD" &&
          !canWrite()
        )
          throw new Error("Session verification is in progress.");
        if (!cookie) return new Response(null, { status: 401 });

        const headers = new Headers(request.headers);
        headers.set("Cookie", cookie);
        headers.set("X-Expected-Account", accountId);
        const response = await send(request, {
          headers,
          credentials: "omit",
          redirect: "error",
          signal: controller.signal,
        });
        const body = await response.text();
        ensureActive(controller.signal);
        return new Response(body || null, {
          status: response.status,
          headers: response.headers,
        });
      } finally {
        lifetime.removeEventListener("abort", abort);
        request.signal?.removeEventListener("abort", abort);
      }
    },
  });
}
