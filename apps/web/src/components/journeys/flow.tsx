import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import "./flow.css";

export function JourneyFlow({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description: string;
  back?: ReactNode;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="@container/journey-flow grid w-full min-w-0 gap-5 [--fold-control:2.75rem] sm:gap-section">
      <header className="grid min-w-0 gap-3">
        {back}
        <div className="grid gap-1.5">
          <h1
            ref={heading}
            tabIndex={-1}
            className="w-fit text-4xl font-bold tracking-tight @min-[48rem]/journey-flow:text-5xl"
          >
            {title}
          </h1>
          <p className="max-w-prose text-muted-foreground">{description}</p>
        </div>
      </header>
      {children}
    </div>
  );
}
