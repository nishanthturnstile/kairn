import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect, useMemo, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { initializeAppearance } from "./lib/appearance";
import { authClient } from "./lib/auth";
import { createWebSession } from "./lib/session";
import { routeTree } from "./routeTree.gen";
import "./index.css";

initializeAppearance();
const session = createWebSession(window.location.origin);

function createCreatorRouter(scope: ReturnType<typeof session.getSnapshot>) {
  return createRouter({ routeTree, context: { scope, signOut } });
}

async function signOut() {
  session.setVerifiedAccount(null);
  try {
    return !(await authClient.signOut()).error;
  } catch {
    return false;
  }
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
  const current = authClient.useSession();
  const accountId = current.data?.user?.emailVerified
    ? current.data.user.id
    : null;
  useEffect(() => session.setVerifiedAccount(accountId), [accountId]);
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
