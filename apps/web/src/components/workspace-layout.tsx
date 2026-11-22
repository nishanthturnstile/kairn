import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  ChevronRight,
  Compass,
  LayoutDashboard,
  MapIcon,
} from "lucide-react";
import {
  type ComponentProps,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { publicEnvironment } from "../env";
import { useMediaQuery } from "../hooks/use-media-query";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";
import { Alert, AlertAction, AlertDescription } from "./ui/alert";
import { Button, ButtonLink } from "./ui/button";
import { CairnLogo, CairnMark } from "./ui/cairn-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { WorkspaceAccountMenu } from "./workspace/account-menu";
import "./workspace/workspace.css";

const destinations = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/journeys", label: "Journeys", icon: MapIcon },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/saved", label: "Saved", icon: Bookmark },
] as const;

type Navigate = (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
type NavigationFocus = Pick<ComponentProps<"nav">, "onFocus" | "onBlur">;

function destinationCurrent(pathname: string, to: string) {
  if (pathname === to) return "page";
  if (pathname.startsWith(`${to}/`)) return "location";
}

export function WorkspaceLayout({
  children,
  scope,
  accountId,
  pathname,
  pageTitle,
}: {
  children: ReactNode;
  scope: AccountScope;
  accountId: string;
  pathname: string;
  pageTitle: string;
}) {
  const { signOut, signOutError } = useSessionAccess();
  const header = useRef<HTMLElement>(null);
  const bottomNav = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const navigationFrom = useRef<string | null>(null);
  const focusedDestination = useRef<HTMLAnchorElement>(null);
  const isMobile = useMediaQuery("(width < 48rem)");

  const navigationFocus: NavigationFocus = {
    onFocus(event) {
      if (event.target instanceof HTMLAnchorElement)
        focusedDestination.current = event.target;
    },
    onBlur(event) {
      if (
        event.relatedTarget ||
        event.currentTarget.hasAttribute("data-workspace-bottom-nav") ===
          window.matchMedia("(width < 48rem)").matches
      ) {
        focusedDestination.current = null;
      }
    },
  };

  function prepareNavigation(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (to !== pathname) navigationFrom.current = pathname;
  }

  function revealFocusedContent(event: FocusEvent<HTMLElement>) {
    const { currentTarget, target } = event;
    const workspaceHeader = header.current;
    if (target === currentTarget || !currentTarget.contains(target)) return;

    // Measure after the browser finishes its own focus scrolling.
    requestAnimationFrame(() => {
      if (target !== document.activeElement) return;
      const { top, bottom } = target.getBoundingClientRect();
      const navigation = bottomNav.current;
      const headerEdge =
        workspaceHeader &&
        getComputedStyle(workspaceHeader).position === "sticky"
          ? workspaceHeader.getBoundingClientRect().bottom
          : 0;
      const navEdge =
        navigation && getComputedStyle(navigation).position === "sticky"
          ? navigation.getBoundingClientRect().top
          : window.innerHeight;
      if (top < headerEdge && headerEdge > 0) {
        window.scrollBy({ top: top - headerEdge - 4, behavior: "instant" });
      } else if (bottom > navEdge && navEdge < window.innerHeight) {
        window.scrollBy({
          top: Math.min(bottom - navEdge + 4, top - headerEdge - 4),
          behavior: "instant",
        });
      }
    });
  }

  useEffect(() => {
    const navigation = bottomNav.current;
    if (!navigation) return;
    const root = document.documentElement;
    const measure = () => {
      root.style.setProperty(
        "--workspace-bottom-nav-size",
        getComputedStyle(navigation).position === "sticky"
          ? `${navigation.offsetHeight}px`
          : "0px",
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(navigation);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--workspace-bottom-nav-size");
    };
  }, []);

  useEffect(() => {
    const previous = focusedDestination.current;
    if (
      !previous ||
      previous.getClientRects().length ||
      (document.activeElement !== document.body &&
        document.activeElement !== previous)
    )
      return;
    const navigation = isMobile
      ? bottomNav.current
      : document.querySelector("[data-workspace-sidebar-nav]");
    const matchingLink = Array.from(
      navigation?.querySelectorAll("a") ?? [],
    ).find((link) => link.pathname === previous.pathname);
    matchingLink?.focus();
  }, [isMobile]);

  useEffect(() => {
    if (navigationFrom.current === null || navigationFrom.current === pathname)
      return;
    navigationFrom.current = null;
    if (!main.current?.contains(document.activeElement))
      main.current?.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <SidebarProvider>
      <ButtonLink
        render={<a href="#main" />}
        variant="outline"
        className="sr-only focus:not-sr-only focus:fixed focus:inset-s-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </ButtonLink>
      <WorkspaceSidebar
        pathname={pathname}
        onNavigate={prepareNavigation}
        navigationFocus={navigationFocus}
      />
      <SidebarInset className="@container/workspace-nav flex flex-col max-md:min-h-dvh">
        <header
          ref={header}
          data-workspace-header=""
          className="control-border-b bg-card"
        >
          <div className="mx-auto flex min-h-(--workspace-header-height) w-full max-w-[82rem] items-center justify-between gap-2 px-4 sm:px-6 xl:px-10">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="md:hidden">
                <CairnMark />
              </span>
              <SidebarTrigger
                size="icon-lg"
                className="hidden md:inline-flex"
              />
              <WorkspaceLocation
                pathname={pathname}
                pageTitle={pageTitle}
                onNavigate={(event) => prepareNavigation(event, "/journeys")}
              />
            </div>
            <WorkspaceAccountMenu
              key={accountId}
              scope={scope}
              accountId={accountId}
              onNavigate={(event) => prepareNavigation(event, "/account")}
            />
          </div>
        </header>
        <main
          ref={main}
          id="main"
          tabIndex={-1}
          onFocus={revealFocusedContent}
          className="mx-auto w-full min-w-0 max-w-[82rem] flex-1 wrap-anywhere px-4 py-6 outline-none sm:px-6 xl:px-10 xl:py-9"
        >
          {signOutError && pathname !== "/account" && (
            <Alert variant="destructive" role="alert" className="mb-section">
              <AlertDescription>{signOutError}</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void signOut()}
                >
                  Try again
                </Button>
              </AlertAction>
            </Alert>
          )}
          {children}
        </main>
        <nav
          ref={bottomNav}
          data-workspace-bottom-nav=""
          aria-label="Main"
          {...navigationFocus}
          className="shrink-0 border-t border-border bg-sidebar text-sidebar-foreground md:hidden"
        >
          <ul className="workspace-bottom-links grid grid-cols-2 gap-1 px-2 pt-1 @min-[18rem]/workspace-nav:grid-cols-4">
            {destinations.map(({ to, label, icon: Icon }) => (
              <li key={to} className="min-w-0">
                <Link
                  to={to}
                  activeOptions={{ exact: true, includeSearch: false }}
                  aria-current={destinationCurrent(pathname, to)}
                  onClick={(event) => prepareNavigation(event, to)}
                  className="flex h-full min-h-[44px] items-center justify-center gap-1.5 rounded-control px-1 py-1 text-center text-xs wrap-anywhere focus-visible:-outline-offset-2 hover:bg-sidebar-accent @min-[18rem]/workspace-nav:flex-col @min-[18rem]/workspace-nav:gap-0.5"
                >
                  <span className="workspace-bottom-icon grid h-[28px] min-w-[36px] shrink-0 place-items-center rounded-full">
                    <Icon aria-hidden="true" className="size-[20px]" />
                  </span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}

function WorkspaceLocation({
  pathname,
  pageTitle,
  onNavigate,
}: {
  pathname: string;
  pageTitle: string;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return pathname.startsWith("/journeys/") ? (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 text-sm sm:gap-2"
    >
      <Link
        to="/journeys"
        activeOptions={{ exact: true }}
        onClick={onNavigate}
        className="hidden shrink-0 rounded-control text-muted-foreground hover:underline sm:inline"
      >
        Journeys
      </Link>
      <ChevronRight
        aria-hidden="true"
        className="hidden size-4 shrink-0 text-muted-foreground sm:block"
      />
      <span aria-current="page" className="truncate font-semibold">
        {pageTitle}
      </span>
    </nav>
  ) : (
    <span className="truncate font-semibold">{pageTitle}</span>
  );
}

function WorkspaceSidebar({
  pathname,
  onNavigate,
  navigationFocus,
}: {
  pathname: string;
  onNavigate: Navigate;
  navigationFocus: NavigationFocus;
}) {
  const { isMobile } = useSidebar();
  if (isMobile) return null;

  return (
    <Sidebar>
      <SidebarHeader className="min-h-16 justify-between gap-1 control-border-b px-3 group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-1">
        <Link
          to="/dashboard"
          aria-label={publicEnvironment.appName}
          onClick={(event) => onNavigate(event, "/dashboard")}
          className="flex min-h-touch min-w-0 items-center gap-2 rounded-control font-heading text-2xl font-bold tracking-tight hover:underline"
        >
          <span className="hidden size-8 shrink-0 place-items-center group-data-[collapsible=icon]/sidebar:grid">
            <CairnMark large />
          </span>
          <span className="min-w-0 truncate group-data-[collapsible=icon]/sidebar:hidden">
            <CairnLogo name={publicEnvironment.appName} />
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3 py-5 group-data-[collapsible=icon]/sidebar:px-2">
        <nav
          aria-label="Main"
          data-workspace-sidebar-nav=""
          {...navigationFocus}
        >
          <SidebarMenu>
            {destinations.map(({ to, label, icon: Icon }) => {
              const current = destinationCurrent(pathname, to);
              return (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    render={
                      <Link
                        to={to}
                        aria-current={current}
                        activeOptions={{ exact: true, includeSearch: false }}
                        onClick={(event) => onNavigate(event, to)}
                      />
                    }
                    isActive={Boolean(current)}
                    tooltip={label}
                    className="min-h-touch gap-3 text-base"
                  >
                    <Icon aria-hidden="true" />
                    <span className="group-data-[collapsible=icon]/sidebar:sr-only">
                      {label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
