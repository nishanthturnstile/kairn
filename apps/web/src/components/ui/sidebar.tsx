import { cn } from "cn";
import { PanelLeftIcon } from "lucide-react";
import { Slot } from "radix-ui";
import {
  type ComponentProps,
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
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

// Adapted from the shadcn/ui Radix Sidebar. Desktop uses an icon rail and mobile uses a Sheet.
const preferenceKey = "kairn.sidebar";
const navigationId = "workspace-navigation";

type SidebarContextProps = {
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

function SidebarProvider({ children }: { children: ReactNode }) {
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
      value={{ open, openMobile, setOpenMobile, isMobile, toggleSidebar }}
    >
      <TooltipProvider delayDuration={250}>
        <div
          data-slot="sidebar-wrapper"
          className="flex min-h-svh w-full"
          style={
            {
              "--sidebar-width": "min(15rem, 34vw)",
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

function Sidebar({ children }: { children: ReactNode }) {
  const { isMobile, open, openMobile, setOpenMobile } = useSidebar();
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
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (
              !document.getElementById("main")?.contains(document.activeElement)
            ) {
              document
                .querySelector<HTMLButtonElement>(
                  '[data-slot="sidebar-trigger"]',
                )
                ?.focus();
            }
          }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Workspace navigation</SheetTitle>
            <SheetDescription>
              Switch pages or manage your account.
            </SheetDescription>
          </SheetHeader>
          {children}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label="Workspace sidebar"
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
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const label = isMobile
    ? "Open navigation"
    : open
      ? "Collapse sidebar"
      : "Expand sidebar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-slot="sidebar-trigger"
          aria-label={label}
          aria-expanded={isMobile ? openMobile : open}
          aria-controls={!isMobile || openMobile ? navigationId : undefined}
          aria-haspopup={isMobile ? "dialog" : undefined}
          className={className}
          onClick={toggleSidebar}
          {...props}
        >
          <PanelLeftIcon aria-hidden="true" />
        </Button>
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
      className={cn("flex min-h-16 shrink-0 items-center px-3", className)}
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
        "min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-4",
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
  asChild = false,
  isActive = false,
  tooltip,
  className,
  ...props
}: ComponentProps<"button"> & {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
}) {
  const Comp = asChild ? Slot.Root : "button";
  const { isMobile, open } = useSidebar();
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(
        "flex min-h-touch w-full min-w-0 items-center gap-3 rounded-control px-3 py-1 text-start text-base font-semibold transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:-outline-offset-2 aria-expanded:bg-sidebar-accent data-active:bg-sidebar-accent data-active:font-bold data-active:text-sidebar-accent-foreground data-active:inset-ring-1 data-active:inset-ring-current group-data-[collapsible=icon]/sidebar:justify-center group-data-[collapsible=icon]/sidebar:gap-0 group-data-[collapsible=icon]/sidebar:px-0 [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
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
