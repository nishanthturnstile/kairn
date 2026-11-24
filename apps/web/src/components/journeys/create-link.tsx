import type { OnboardingIntent } from "@kairn/contracts";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { journeyIntentCopy } from "@/lib/journey-intent-copy";

export function CreateJourneyLink({ intent }: { intent?: OnboardingIntent }) {
  return (
    <ButtonLink
      size="lg"
      render={<Link to="/journeys/new" search={{ intent }} />}
    >
      <Plus aria-hidden="true" data-icon="inline-start" />
      <span>
        {intent ? journeyIntentCopy[intent].action : "Create a journey"}
      </span>
    </ButtonLink>
  );
}
