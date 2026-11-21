import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/onboarding_/companions")({
  component: () => <Navigate to="/dashboard" replace />,
});
