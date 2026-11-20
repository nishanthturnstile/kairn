import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { publicEnvironment } from "../env";
import { useSessionAccess } from "../lib/session-access";
import { AppearanceSwitcher } from "./appearance-switcher";

export function AuthLayout({ children }: { children: ReactNode }) {
  const { state } = useSessionAccess();
  return (
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="mx-auto grid w-full min-w-0 max-w-116 grid-rows-[auto_1fr] px-5 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-2 py-5 lg:py-7">
          <Link
            to={state === "verified" ? "/dashboard" : "/account"}
            search={{}}
            className="flex min-h-touch min-w-touch items-center text-xl font-semibold text-primary hover:underline"
          >
            {publicEnvironment.appName}
          </Link>
          <AppearanceSwitcher />
        </header>
        <main className="grid min-w-0 content-start py-8 wrap-anywhere sm:py-12 lg:content-center lg:pt-10 lg:pb-24">
          {children}
        </main>
      </div>
      <div aria-hidden="true" className="auth-illustration" />
    </div>
  );
}
