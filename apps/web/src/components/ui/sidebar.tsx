import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { PanelLeftIcon } from "lucide-react";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "./button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

// Adapted from the shadcn/ui Base Sidebar. Desktop uses an icon rail and mobile uses a Sheet.

type SidebarContextProps = {
  navigationId: string;
  open: boolean;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextProps | null>(null);

function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("SidebarProvider is missing.");
  return context;
}

function SidebarProvider({
  children,
  preferenceKey = "kairn.sidebar",
}: {
  children: ReactNode;
  preferenceKey?: string;
}) {
  const navigationId = useId();
  const isMobile = useMediaQuery("(width < 48rem)");
  const isWide = useMediaQuery("(width >= 80rem)");
  const [openMobile, setOpenMobile] = useState(false);
  const [preferences, setPreferences] = useState<{
    compact?: boolean;
    wide?: boolean;
  }>(() => {
    try {
      const { compact, wide } = JSON.parse(
        window.localStorage.getItem(preferenceKey) ?? "{}",
      );
      return {
        compact: typeof compact === "boolean" ? compact : undefined,
        wide: typeof wide === "boolean" ? wide : undefined,
      };
    } catch {
      return {};
    }
  });
  const size = isWide ? "wide" : "compact";
  const open = preferences[size] ?? isWide;

  useEffect(() => {
    if (!isMobile) setOpenMobile(false);
  }, [isMobile]);

  function toggleSidebar() {
    if (isMobile) {
      setOpenMobile(!openMobile);
      return;
    }
    const next = { ...preferences, [size]: !open };
    setPreferences(next);
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
    } catch {
      // The current tab can still use its preference without storage.
    }
  }

  return (
    <SidebarContext.Provider
      value={{
        navigationId,
        open,
        openMobile,
        setOpenMobile,
        isMobile,
        toggleSidebar,
      }}
    >
      <TooltipProvider delay={250}>
        <div
          data-slot="sidebar-wrapper"
          className="flex min-h-svh w-full"
          style={
            {
              "--sidebar-width": "min(13rem, 34vw)",
              "--sidebar-width-icon": "calc(var(--spacing-touch) + 1.5rem)",
            } as CSSProperties
          }
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

function Sidebar({
  children,
  label = "Workspace navigation",
  description = "Switch pages or manage your account.",
  onNavigationClose,
}: {
  children: ReactNode;
  label?: string;
  description?: string;
  onNavigationClose?: () => boolean;
}) {
  const { navigationId, isMobile, open, openMobile, setOpenMobile } =
    useSidebar();
  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent
          id={navigationId}
          side="left"
          showCloseButton={false}
          data-slot="sidebar"
          data-mobile="true"
          className="data-[side=left]:w-[min(21rem,calc(100vw-1rem))] gap-0 bg-sidebar p-0 text-base text-sidebar-foreground"
          finalFocus={() => {
            if (
              onNavigationClose?.() ||
              document.getElementById("main")?.contains(document.activeElement)
            )
              return false;
            return document.getElementById(`${navigationId}-trigger`) ?? true;
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label={
        label === "Workspace navigation" ? "Workspace sidebar" : label
      }
      data-slot="sidebar"
      data-state={open ? "expanded" : "collapsed"}
      data-collapsible={open ? "" : "icon"}
      className="group/sidebar hidden shrink-0 text-sidebar-foreground md:block"
    >
      <div
        data-slot="sidebar-gap"
        className="w-(--sidebar-width) transition-[width] group-data-[collapsible=icon]/sidebar:w-(--sidebar-width-icon) motion-reduce:transition-none"
      />
      <div
        id={navigationId}
        data-slot="sidebar-container"
        className="fixed inset-y-0 start-0 z-10 flex h-svh w-(--sidebar-width) flex-col control-border-e bg-sidebar transition-[width] group-data-[collapsible=icon]/sidebar:w-(--sidebar-width-icon) motion-reduce:transition-none"
      >
        {children}
      </div>
    </aside>
  );
}

function SidebarTrigger({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  const { navigationId, isMobile, open, openMobile, toggleSidebar } =
    useSidebar();
  const label = isMobile
    ? "Open navigation"
    : open
      ? "Collapse sidebar"
      : "Expand sidebar";
  return (
    <Tooltip disabled={isMobile}>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            id={`${navigationId}-trigger`}
            data-slot="sidebar-trigger"
            aria-label={label}
            aria-expanded={isMobile ? openMobile : open}
            aria-controls={!isMobile || openMobile ? navigationId : undefined}
            aria-haspopup={isMobile ? "dialog" : undefined}
            className={className}
            onClick={toggleSidebar}
            {...props}
          />
        }
      >
        <PanelLeftIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent hidden={isMobile} side="bottom">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SidebarInset({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn("min-w-0 flex-1 bg-background", className)}
      {...props}
    />
  );
}

function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      className={cn("flex min-h-12 shrink-0 items-center px-3", className)}
      {...props}
    />
  );
}

function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      className={cn(
        "shrink-0 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    />
  );
}

function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      className={cn(
        "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-3",
        className,
      )}
      {...props}
    />
  );
}

function SidebarMenu({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      className={cn("grid min-w-0 gap-1", className)}
      {...props}
    />
  );
}

function SidebarMenuItem(props: ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" {...props} />;
}

function SidebarMenuButton({
  render,
  isActive = false,
  tooltip,
  className,
  ...props
}: ComponentProps<"button"> & {
  render?: useRender.ComponentProps<"button">["render"];
  isActive?: boolean;
  tooltip?: string;
}) {
  const { isMobile, open } = useSidebar();
  const button = useRender({
    defaultTagName: "button",
    render,
    props: mergeProps<"button">(
      {
        className: cn(
          "flex min-h-control w-full min-w-0 items-center gap-2 rounded-control px-3 py-1 text-start text-(length:--text-control) font-medium motion-safe:transition-colors not-data-active:hover:bg-sidebar-accent not-data-active:hover:text-sidebar-accent-foreground focus-visible:-outline-offset-2 aria-expanded:bg-sidebar-accent group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:gap-0 group-data-[collapsible=icon]/sidebar:px-0 [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
          className,
        ),
      },
      props,
    ),
    state: { slot: "sidebar-menu-button", active: isActive },
  });
  if (!tooltip) return button;
  return (
    <Tooltip disabled={isMobile || open}>
      <TooltipTrigger render={button} />
      <TooltipContent side="right" sideOffset={6} hidden={isMobile || open}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export {
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
};
