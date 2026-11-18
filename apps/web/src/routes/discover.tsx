import { createFileRoute } from "@tanstack/react-router";
import { WorkspacePage } from "../components/workspace-page";

export const Route = createFileRoute("/discover")({ component: Discover });

function Discover() {
  return (
    <WorkspacePage
      title="Discover"
      description="Find approved stories and practical details from other journeys."
      emptyTitle="No published journeys yet"
      emptyDescription="Journeys will appear here as their publishers make them discoverable."
    />
  );
}
