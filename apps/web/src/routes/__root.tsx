import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { publicEnvironment } from "../env";
import type { AccountScope } from "../lib/session";

export const Route = createRootRouteWithContext<{
  scope: AccountScope;
  signOut: () => Promise<boolean>;
}>()({
  component: AppShell,
});

const links = [
  { to: "/journeys", label: "Journeys" },
  { to: "/discover", label: "Discover" },
  { to: "/saved", label: "Saved" },
] as const;

function AppShell() {
  return (
    <div className="grid min-h-svh md:grid-cols-[14rem_minmax(0,1fr)]">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-card focus:p-3"
        href="#main"
      >
        Skip to content
      </a>
      <aside className="border-b bg-card md:border-r md:border-b-0 md:px-6 md:py-8">
        <Link
          to="/journeys"
          className="flex min-h-11 items-center gap-2 px-5 pt-3 font-semibold tracking-tight text-primary md:px-2 md:pt-0"
        >
          <span
            aria-hidden="true"
            className="size-3 rounded-[3px] bg-primary"
          />
          {publicEnvironment.appName}
        </Link>
        <nav
          aria-label="Main"
          className="flex gap-1 overflow-x-auto px-3 py-2 md:mt-7 md:flex-col md:p-0"
        >
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex min-h-11 min-w-fit items-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link
          to="/account"
          className="flex min-h-11 items-center px-5 text-sm font-medium text-primary md:px-3"
        >
          Account
        </Link>
      </aside>
      <main
        id="main"
        className="mx-auto w-full max-w-[62rem] px-5 py-10 sm:px-10 md:py-16"
      >
        <Outlet />
      </main>
    </div>
  );
}
