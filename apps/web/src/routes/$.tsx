import { createFileRoute, Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { JourneyFlow } from "../components/journeys/flow";
import { ButtonLink } from "../components/ui/button";

export const Route = createFileRoute("/$")({ component: UnavailablePage });

function UnavailablePage() {
  return (
    <section className="grid max-w-xl gap-4">
      <span className="flex size-12 items-center justify-center rounded-control bg-accent text-primary">
        <Compass aria-hidden="true" />
      </span>
      <JourneyFlow
        title="Page unavailable"
        description="This link may be outdated. You can return to your Dashboard or open Journeys."
      >
        <div className="flex flex-wrap gap-2">
          <ButtonLink render={<Link to="/dashboard" replace />}>
            Go to Dashboard
          </ButtonLink>
          <ButtonLink
            render={<Link to="/journeys" replace />}
            variant="outline"
          >
            Open Journeys
          </ButtonLink>
        </div>
      </JourneyFlow>
    </section>
  );
}
