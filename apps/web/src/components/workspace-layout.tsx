import { Link } from "@tanstack/react-router";
import {
  Bookmark,
  ChevronDown,
  Compass,
  LayoutDashboard,
  LogOut,
  MapIcon,
  UserRound,
  XIcon,
} from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { publicEnvironment } from "../env";
import {
  appearanceOptions,
  getAppearance,
  getServerAppearance,
  setAppearance,
  subscribeToAppearance,
} from "../lib/appearance";
import { authClient } from "../lib/auth";
import { useProfile } from "../lib/profile";
import type { AccountScope } from "../lib/session";
import { useSessionAccess } from "../lib/session-access";
import { AppearanceIcon, appearanceLabels } from "./appearance-switcher";
import { ProfileAvatar } from "./profile-avatar";
import { Alert, AlertAction, AlertDescription } from "./ui/alert";
import { Button, ButtonLink } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { FoldMark } from "./ui/fold-mark";
import { SheetClose } from "./ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";

const destinations = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/journeys", label: "Journeys", icon: MapIcon },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/saved", label: "Saved", icon: Bookmark },
] as const;

export function WorkspaceLayout({
  children,
  scope,
  accountId,
  pathname,
}: {
  children: ReactNode;
  scope: AccountScope;
  accountId: string;
  pathname: string;
}) {
  const { signOut, signOutError } = useSessionAccess();

  return (
    <SidebarProvider>
      <ButtonLink
        render={<a href="#main" />}
        variant="outline"
        className="sr-only focus:not-sr-only focus:absolute focus:inset-s-4 focus:top-4 focus:z-20"
      >
        Skip to content
      </ButtonLink>
      <WorkspaceSidebar
        scope={scope}
        accountId={accountId}
        pathname={pathname}
      />
      <SidebarInset>
        <header className="flex min-h-12 flex-wrap items-center control-border-b bg-card px-2 sm:px-5">
          <SidebarTrigger />
          <WorkspaceBrand className="md:hidden" />
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-[82rem] wrap-anywhere px-4 py-4 sm:px-6 lg:py-section"
        >
          {signOutError && pathname !== "/account" && (
            <Alert variant="destructive" role="alert" className="mb-4">
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
      </SidebarInset>
    </SidebarProvider>
  );
}

function WorkspaceBrand({
  className,
  onClick,
}: {
  className?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div className={className}>
      <Link
        to="/dashboard"
        aria-label={publicEnvironment.appName}
        onClick={onClick}
        className="flex min-h-touch min-w-touch items-center gap-2 rounded-control font-bold text-xl text-primary hover:underline group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:px-0"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-control bg-primary text-primary-foreground"
        >
          <FoldMark />
        </span>
        <span className="group-data-[collapsible=icon]/sidebar:sr-only">
          {publicEnvironment.appName}
        </span>
      </Link>
    </div>
  );
}

function WorkspaceSidebar({
  scope,
  accountId,
  pathname,
}: {
  scope: AccountScope;
  accountId: string;
  pathname: string;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  function closeOnNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
      setOpenMobile(false);
  }

  return (
    <Sidebar>
      <SidebarHeader className="flex-wrap justify-between control-border-b">
        <WorkspaceBrand onClick={closeOnNavigation} />
        {isMobile && (
          <SheetClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </SheetClose>
        )}
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main">
          <SidebarMenu>
            {destinations.map(({ to, label, icon: Icon }) => (
              <SidebarMenuItem key={to}>
                <SidebarMenuButton
                  render={
                    <Link
                      to={to}
                      activeOptions={{
                        exact: to !== "/journeys",
                        includeSearch: false,
                      }}
                      onClick={closeOnNavigation}
                    />
                  }
                  isActive={pathname === to || pathname.startsWith(`${to}/`)}
                  tooltip={label}
                >
                  <Icon aria-hidden="true" />
                  <span className="group-data-[collapsible=icon]/sidebar:sr-only">
                    {label}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <AccountMenu
          scope={scope}
          accountId={accountId}
          active={pathname === "/account"}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

function AccountMenu({
  scope,
  accountId,
  active,
}: {
  scope: AccountScope;
  accountId: string;
  active: boolean;
}) {
  const { data } = authClient.useSession();
  const { signOut } = useSessionAccess();
  const { isMobile, setOpenMobile } = useSidebar();
  const { data: profile } = useProfile(scope, accountId);
  const user = data?.user.id === accountId ? data.user : undefined;
  const displayName = profile?.displayName || user?.name;
  const name = displayName || "Account";
  const appearance = useSyncExternalStore(
    subscribeToAppearance,
    getAppearance,
    getServerAppearance,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            type="button"
            tooltip="Account menu"
            isActive={active}
            className="min-h-14 max-sm:gap-2 max-sm:px-2"
          />
        }
      >
        <ProfileAvatar name={displayName} />
        <span className="grid min-w-0 flex-1 gap-0.5 leading-tight group-data-[collapsible=icon]/sidebar:sr-only">
          <span className="wrap-anywhere">{name}</span>
          {user?.email && (
            <span className="truncate text-sm font-normal text-muted-foreground">
              {user.email}
            </span>
          )}
        </span>
        <span className="sr-only"> account menu</span>
        <ChevronDown
          aria-hidden="true"
          className="hidden min-[360px]:block group-data-[collapsible=icon]/sidebar:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "top" : "right"}
        align={isMobile ? "start" : "end"}
        sideOffset={8}
        collisionPadding={8}
        aria-label="Account menu"
        className="w-[17rem] min-w-0 max-w-[calc(100vw-1rem)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="grid gap-0.5 wrap-anywhere">
            <span className="text-base font-semibold text-foreground">
              {name}
            </span>
            {user?.email && <span className="font-normal">{user.email}</span>}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link to="/account" />}
            onClick={() => setOpenMobile(false)}
          >
            <UserRound aria-hidden="true" />
            Account
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel id="workspace-appearance">
            Appearance
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            aria-labelledby="workspace-appearance"
            className="grid grid-cols-[repeat(auto-fit,minmax(min(7.5rem,100%),1fr))] gap-1 px-1 pb-1"
            value={appearance}
            onValueChange={(value) => {
              const next = appearanceOptions.find((option) => option === value);
              if (next) setAppearance(next);
            }}
          >
            {appearanceOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                className="ps-2 pe-7 wrap-anywhere data-checked:bg-accent data-checked:text-accent-foreground"
              >
                <AppearanceIcon mode={option} />
                {appearanceLabels[option]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void signOut()}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
