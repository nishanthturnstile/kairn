import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookmarkIcon,
  BoxesIcon,
  CheckSquareIcon,
  FormInputIcon,
  GalleryVerticalEndIcon,
  LayersIcon,
  MenuSquareIcon,
  MousePointer2Icon,
  SearchIcon,
  SwatchBookIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import foldArt from "@/assets/fold.webp";
import { AppearanceSwitcher } from "@/components/appearance-switcher";
import { Button, ButtonLink } from "@/components/ui/button";
import { CairnMark } from "@/components/ui/cairn-logo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SheetClose } from "@/components/ui/sheet";
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
} from "@/components/ui/sidebar";
import { Foundations } from "./foundations";
import {
  ActionSpecimen,
  DropzoneSpecimen,
  ExpressionSpecimen,
  FeedbackSpecimen,
  FieldsSpecimen,
  NavigationSpecimen,
  OverlaySpecimen,
  SelectionSpecimen,
  SurfaceSpecimen,
} from "./specimens";

const sections = [
  { id: "overview", terms: "studio fold", name: "Overview", icon: BoxesIcon },
  {
    id: "foundations",
    terms:
      "colour color type typography spacing motion targets press reduced motion",
    name: "Foundations",
    icon: SwatchBookIcon,
  },
  {
    id: "actions",
    terms: "button primary secondary ghost link destructive icon",
    name: "Buttons",
    icon: MousePointer2Icon,
  },
  {
    id: "navigation",
    terms: "tabs dock rail sidebar",
    name: "Navigation",
    icon: MenuSquareIcon,
  },
  {
    id: "fields",
    terms:
      "input textarea native select forms text field label validation password visibility date time calendar clock picker schedule masked keyboard entry",
    name: "Text fields",
    icon: FormInputIcon,
  },
  {
    id: "file-dropzone",
    terms: "file upload dropzone drag and drop file picker gpx",
    name: "File dropzone",
    icon: FormInputIcon,
  },
  {
    id: "selection",
    terms: "checkbox radio switch toggle",
    name: "Selection",
    icon: CheckSquareIcon,
  },
  {
    id: "feedback",
    terms:
      "toast receipt notification alert progress skeleton empty loading warning error",
    name: "Feedback",
    icon: GalleryVerticalEndIcon,
  },
  {
    id: "expression",
    name: "Icons, illustration & loading",
    terms:
      "lucide mark empty journeys folded map splash spinner skeleton animation motion illustration loading",
    icon: LayersIcon,
  },
  {
    id: "surfaces",
    terms: "card avatar badge disclosure",
    name: "Rows & cards",
    icon: BookmarkIcon,
  },
  {
    id: "overlays",
    terms: "dialog sheet dropdown menu sort bookmark command destructive",
    name: "Menus & overlays",
    icon: LayersIcon,
  },
];
const specimenDestinations = [
  {
    id: "field-availability",
    name: "Read-only and disabled fields",
    terms: "read only unavailable disabled fields",
  },
  {
    id: "choice-availability",
    name: "Disabled choices",
    terms: "disabled checkbox radio switch unavailable",
  },
  { id: "action-tooltip", name: "About action sizes", terms: "tooltip" },
  {
    id: "button-preview-state",
    name: "Button preview state",
    terms: "ready pending saving saved success disabled",
  },
];

function focusSection(id: string) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: "start" });
}
function CatalogIndex({ current }: { current: string }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const nextSection = useRef<string | null>(null);
  function selectSection(id: string) {
    if (isMobile) {
      nextSection.current = id;
      setOpenMobile(false);
    } else {
      requestAnimationFrame(() => focusSection(id));
    }
  }
  return (
    <Sidebar
      label="Component index"
      description="Jump to a component family."
      onNavigationClose={() => {
        if (!nextSection.current) return false;
        focusSection(nextSection.current);
        nextSection.current = null;
        return true;
      }}
    >
      <SidebarHeader className="justify-between border-b">
        <Link
          to="/design-system"
          hash="overview"
          activeOptions={{ includeHash: true }}
          className="flex items-center gap-2 font-heading font-bold"
          onClick={() => selectSection("overview")}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-control bg-citron text-citron-foreground">
            <CairnMark />
          </span>
          <span className="group-data-[collapsible=icon]/sidebar:sr-only">
            Kairn studio
          </span>
        </Link>
        {isMobile && (
          <SheetClose
            render={
              <Button size="icon" variant="ghost" aria-label="Close index" />
            }
          >
            <XIcon />
          </SheetClose>
        )}
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Catalog sections">
          <SidebarMenu>
            {sections.map(({ id, name, icon: Icon }) => (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton
                  render={
                    <a
                      href={`#${id}`}
                      aria-current={current === id ? "location" : undefined}
                      onClick={() => selectSection(id)}
                    />
                  }
                  isActive={current === id}
                  tooltip={name}
                >
                  <Icon aria-hidden="true" />
                  <span className="group-data-[collapsible=icon]/sidebar:sr-only">
                    {name}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
function FindComponent() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const destination = useRef<string | null>(null);
  const shortcutOrigin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (
          document.querySelector(
            '[data-open]:is([data-slot="dialog-content"], [data-slot="sheet-content"], [data-mobile="true"][role="dialog"])',
          )
        )
          return;
        event.preventDefault();
        shortcutOrigin.current =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        setQuery("");
        setOpen(true);
      }
    }
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  const destinations = query.trim()
    ? [...sections, ...specimenDestinations]
    : sections;
  const matches = destinations.filter((item) =>
    `${item.name} ${item.terms}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Find a component" />
        }
      >
        <SearchIcon />
      </DialogTrigger>
      <DialogContent
        finalFocus={() => {
          const id = destination.current;
          destination.current = null;
          const origin = shortcutOrigin.current;
          shortcutOrigin.current = null;
          if (id) {
            focusSection(id);
            return false;
          } else if (origin?.isConnected) {
            return origin;
          }
          return true;
        }}
      >
        <DialogTitle>Find a component</DialogTitle>
        <DialogDescription>Search by component or state.</DialogDescription>
        <Input
          type="search"
          aria-label="Component name"
          placeholder="Button, spacing, dialog…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <nav aria-label="Matching components" className="grid gap-1">
          {matches.map(({ id, name }) => (
            <ButtonLink
              key={id}
              variant="ghost"
              className="justify-start"
              render={
                <Link
                  to="/design-system"
                  hash={id}
                  activeOptions={{ includeHash: true }}
                  onClick={() => {
                    destination.current = id;
                    setOpen(false);
                  }}
                />
              }
            >
              {name}
            </ButtonLink>
          ))}
        </nav>
        {!matches.length && <p role="status">No matching components.</p>}
      </DialogContent>
    </Dialog>
  );
}
export function DesignSystem() {
  return (
    <SidebarProvider preferenceKey="kairn.studio.sidebar">
      <Atlas />
    </SidebarProvider>
  );
}
function Atlas() {
  const hash = useRouterState({ select: (state) => state.location.hash });
  const [current, setCurrent] = useState("overview");
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    const main = content.current;
    if (!main) return;
    const headings = sections.flatMap(({ id }) => {
      const heading = document.getElementById(id);
      return heading ? [heading] : [];
    });
    const target = [...sections, ...specimenDestinations].some(
      ({ id }) => id === hash,
    )
      ? document.getElementById(hash)
      : null;
    let preferred = target;
    let frame = 0;
    function update() {
      frame = 0;
      if (!main) return;
      const top = main.getBoundingClientRect().top;
      const limit = main.scrollHeight - main.clientHeight;
      if (preferred && main.contains(preferred)) {
        const offset = preferred.getBoundingClientRect().top - top;
        const landing = Math.max(
          0,
          Math.min(limit, main.scrollTop + offset - 8),
        );
        if (Math.abs(main.scrollTop - landing) <= 3) {
          setCurrent(
            preferred
              .closest('[data-slot="card"]')
              ?.getAttribute("aria-labelledby") ?? preferred.id,
          );
          return;
        }
      }
      const atEnd = limit > 0 && main.scrollTop >= limit - 1;
      let row = -Infinity;
      let active = "overview";
      for (const heading of headings) {
        const offset = heading.getBoundingClientRect().top - top;
        if ((atEnd || offset <= 12) && offset > row + 1) {
          row = offset;
          active = heading.id;
        }
      }
      setCurrent(active);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function readingScroll() {
      preferred = null;
      schedule();
    }
    function onFocus(event: FocusEvent) {
      if (event.target === target) preferred = target;
      schedule();
    }
    function onKey(event: KeyboardEvent) {
      if (
        [
          "PageUp",
          "PageDown",
          "Home",
          "End",
          "ArrowUp",
          "ArrowDown",
          " ",
        ].includes(event.key) &&
        (event.target === main ||
          event.target === document.body ||
          headings.includes(event.target as HTMLElement))
      )
        readingScroll();
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(main);
    for (const heading of headings) observer.observe(heading);
    main.addEventListener("scroll", schedule, { passive: true });
    main.addEventListener("wheel", readingScroll, { passive: true });
    main.addEventListener("touchmove", readingScroll, { passive: true });
    main.addEventListener("focusin", onFocus);
    window.addEventListener("keydown", onKey);
    schedule();
    return () => {
      main.removeEventListener("scroll", schedule);
      main.removeEventListener("wheel", readingScroll);
      main.removeEventListener("touchmove", readingScroll);
      main.removeEventListener("focusin", onFocus);
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [hash]);
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-card"
      >
        Skip to component library
      </a>
      <CatalogIndex current={current} />
      <SidebarInset className="flex h-dvh flex-col">
        <header className="shrink-0 flex min-h-12 flex-wrap items-center gap-2 border-b bg-card px-3">
          <SidebarTrigger />
          <span className="hidden min-[26rem]:inline font-semibold">
            Design system
          </span>
          <span className="ms-auto" />
          <FindComponent />
          <AppearanceSwitcher showLabel />
        </header>
        <main
          ref={content}
          id="main"
          tabIndex={-1}
          className="relative min-h-0 flex-1 overflow-y-auto scroll-pt-2 wrap-anywhere"
        >
          <div className="mx-auto grid w-full min-w-0 max-w-[76rem] gap-section p-3 sm:p-6">
            <section className="relative isolate overflow-hidden rounded-card bg-dock px-4 py-6 text-dock-foreground sm:px-7 sm:py-8">
              <img
                src={foldArt}
                alt=""
                className="pointer-events-none float-end ms-2 h-16 w-1/3 object-contain sm:absolute sm:inset-y-0 sm:end-0 sm:-z-10 sm:ms-0 sm:h-full sm:w-[42%]"
              />
              <div className="max-w-full sm:max-w-[60%]">
                <h1
                  id="overview"
                  tabIndex={-1}
                  className="scroll-mt-20 font-heading text-[clamp(3rem,7vw,6rem)] leading-none font-bold tracking-[-0.04em]"
                >
                  Fold<span className="text-citron">.</span>
                </h1>
                <p className="mt-1">Kairn’s web design system.</p>
                <a
                  href="#actions"
                  className="mt-2 inline-block min-h-control content-center font-semibold text-citron underline-offset-4 hover:underline focus-visible:outline-citron"
                >
                  Explore{" "}
                  <span className="ms-1 whitespace-nowrap">components ↘</span>
                </a>
              </div>
            </section>
            <Foundations />
            <section aria-label="Component library" className="min-w-0">
              <h2 className="mb-2 text-2xl font-bold tracking-tight">
                Component library
              </h2>
              <div className="grid items-start gap-3 lg:grid-cols-2">
                <ActionSpecimen />
                <NavigationSpecimen />
                <FieldsSpecimen />
                <DropzoneSpecimen />
                <SelectionSpecimen />
                <FeedbackSpecimen />
                <ExpressionSpecimen />
                <SurfaceSpecimen />
                <OverlaySpecimen />
              </div>
            </section>
          </div>
        </main>
      </SidebarInset>
    </>
  );
}
