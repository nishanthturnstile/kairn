import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useMemo, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { createWebSession } from "./lib/session";
import { routeTree } from "./routeTree.gen";
import "virtual:kairn-theme.css";
import "./index.css";

const session = createWebSession(window.location.origin);

function createCreatorRouter(scope: ReturnType<typeof session.getSnapshot>) {
  return createRouter({ routeTree, context: { scope } });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createCreatorRouter>;
  }
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("The application root element is missing.");
}

createRoot(root).render(
  <StrictMode>
    <CreatorApp />
  </StrictMode>,
);

function CreatorApp() {
  const scope = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const router = useMemo(() => createCreatorRouter(scope), [scope]);
  return (
    <QueryClientProvider
      key={scope.accountId ?? "signed-out"}
      client={scope.queryClient}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
