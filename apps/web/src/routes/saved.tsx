import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "../components/workspace-page";

export const Route = createFileRoute("/saved")({ component: Saved });

function Saved() {
  const { scope } = Route.useRouteContext();
  return (
    <WorkspacePage
      title="Saved"
      description="Stories and research you want to return to."
      accountRequired={scope.accountId === null}
      returnTo="/saved"
      emptyTitle="Nothing saved yet"
      emptyDescription="Journeys you save from Discover will appear here."
    />
  );
}
