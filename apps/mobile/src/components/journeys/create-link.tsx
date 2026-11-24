import type { OnboardingIntent } from "@kairn/contracts";
import { journeyIntentCopy } from "@kairn/shared/journey-intent-copy";
import { Link } from "expo-router";
import { gpxJourneyCreation } from "../../journey-creation";
import { Action } from "../fold/primitives";

export function CreateJourneyLink({ intent }: { intent?: OnboardingIntent }) {
  const choice = gpxJourneyCreation ? undefined : intent;
  return (
    <Link
      href={
        choice
          ? { pathname: "/journeys/new", params: { intent: choice } }
          : "/journeys/new"
      }
      withAnchor
      asChild
    >
      <Action
        label={choice ? journeyIntentCopy[choice].action : "Create a journey"}
        variant="primary"
        accessibilityRole="link"
      />
    </Link>
  );
}
