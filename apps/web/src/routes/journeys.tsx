import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "../components/workspace-page";

export const Route = createFileRoute("/journeys")({ component: Journeys });

function Journeys() {
  const { scope } = Route.useRouteContext();
  return (
    <WorkspacePage
      title="Journeys"
      description="Trips you’ve made and journeys you’ve joined."
      accountRequired={scope.accountId === null}
      emptyTitle="No journeys yet"
      emptyDescription="Journeys will appear here when you create or join one."
    />
  );
}
