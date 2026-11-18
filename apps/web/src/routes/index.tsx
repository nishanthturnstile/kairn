import { createFileRoute } from "@tanstack/react-router";
import { publicEnvironment } from "../env";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{publicEnvironment.appName}</h1>
    </main>
  );
}
