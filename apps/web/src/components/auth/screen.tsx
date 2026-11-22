import { type ComponentType, type ReactNode, useCallback, useId } from "react";

export function AuthScreen({
  title,
  description,
  status,
  icon: Icon,
  children,
}: {
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  icon?: ComponentType<{ className?: string; "aria-hidden": boolean }>;
  children: ReactNode;
}) {
  const statusId = useId();
  const descriptionId = useId();
  const describedBy = [description && descriptionId, status && statusId]
    .filter(Boolean)
    .join(" ");
  const focusHeading = useCallback((heading: HTMLHeadingElement | null) => {
    heading?.focus();
  }, []);

  return (
    <section className="grid min-w-0 gap-section">
      <header className="grid gap-2">
        {Icon && (
          <span className="mb-2 grid size-touch place-items-center rounded-card control-border border-border bg-muted">
            <Icon aria-hidden={true} className="size-5" />
          </span>
        )}
        <h1
          key={title}
          ref={focusHeading}
          tabIndex={-1}
          aria-describedby={describedBy || undefined}
          className="font-heading text-4xl leading-[1.08] font-bold tracking-[-0.035em] text-balance outline-none lg:text-[3.25rem]"
        >
          {title}
        </h1>
        {description && (
          <p
            id={descriptionId}
            className="max-w-[38ch] text-lg leading-snug text-pretty text-muted-foreground"
          >
            {description}
          </p>
        )}
        {status && <div id={statusId}>{status}</div>}
      </header>
      {children}
    </section>
  );
}
