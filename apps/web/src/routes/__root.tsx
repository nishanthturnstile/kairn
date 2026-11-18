import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { AppearanceSelect } from "../components/appearance-select";
import { Button } from "../components/ui/button";
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
  { to: "/account", label: "Account" },
] as const;

function AppShell() {
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-1">
      <Button
        asChild
        variant="outline"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-10"
      >
        <a href="#main">Skip to content</a>
      </Button>
      <header className="grid content-start gap-3 control-border-b bg-card px-4 py-3 sm:px-6 lg:gap-8 lg:border-b-0 lg:control-border-e lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:flex-col lg:items-start lg:gap-4">
          <Link
            to="/journeys"
            className="flex min-h-touch min-w-touch items-center text-xl font-semibold text-primary hover:underline"
          >
            {publicEnvironment.appName}
          </Link>
          <AppearanceSelect />
        </div>
        <nav aria-label="Main" className="flex flex-wrap gap-1 lg:flex-col">
          {links.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to !== "/account" }}
              className="flex min-h-touch min-w-touch items-center rounded-control px-3 py-2 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground aria-[current=page]:underline aria-[current=page]:underline-offset-4"
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full min-w-0 max-w-[62rem] wrap-anywhere px-4 py-8 sm:px-6 lg:px-section lg:py-16"
      >
        <Outlet />
      </main>
    </div>
  );
}
