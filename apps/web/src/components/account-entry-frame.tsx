import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { publicEnvironment } from "../env";
import { useSessionAccess } from "../lib/session-access";
import { AppearanceSwitcher } from "./appearance-switcher";
import { ButtonLink } from "./ui/button";
import { CairnLogo } from "./ui/cairn-logo";

const wordmark =
  "flex min-h-touch min-w-touch items-center gap-2 font-heading text-2xl font-bold tracking-tight";

export function AccountEntryFrame({
  children,
  setup = false,
}: {
  children: ReactNode;
  setup?: boolean;
}) {
  const { state } = useSessionAccess();
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-[90rem] flex-col px-4 sm:px-8 lg:px-12">
      <ButtonLink
        render={<a href="#main" />}
        variant="outline"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </ButtonLink>
      <header className="flex flex-wrap items-center justify-between gap-2 control-border-b border-border py-3 sm:py-5 lg:py-6">
        {setup ? (
          <span className={wordmark}>
            <CairnLogo name={publicEnvironment.appName} />
          </span>
        ) : (
          <Link
            to={state === "verified" ? "/dashboard" : "/account"}
            search={{}}
            className={`${wordmark} hover:underline`}
          >
            <CairnLogo name={publicEnvironment.appName} />
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <AppearanceSwitcher large />
          {setup && (
            <ButtonLink
              render={<Link to="/account" />}
              variant="ghost"
              size="lg"
            >
              Account
            </ButtonLink>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
