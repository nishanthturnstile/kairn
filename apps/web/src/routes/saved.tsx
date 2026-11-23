import { createFileRoute } from "@tanstack/react-router";
import { CollectionsPage } from "../components/collections-page";

export const Route = createFileRoute("/saved")({
  component: () => <CollectionsPage destination="saved" />,
});
