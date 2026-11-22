import { useRouter } from "expo-router";
import { Action } from "../components/fold/primitives";
import { FoldScreen } from "../components/fold/screen";
import { JourneyFlowHeading } from "../components/journeys/flow";
import { useMobileSession } from "../mobile-session";
import { useWorkspace, WorkspaceWaiting } from "../workspace";

export default function UnavailablePage() {
  const router = useRouter();
  const { state } = useMobileSession();
  const { progress } = useWorkspace();

  if (
    state !== "verified" ||
    !progress.data ||
    progress.data.state === "pending" ||
    progress.isError
  ) {
    return <WorkspaceWaiting />;
  }

  return (
    <FoldScreen top safeBottom>
      <JourneyFlowHeading
        title="Page unavailable"
        description="This link may be outdated. You can return to your Dashboard or open Journeys."
      />
      <Action
        label="Go to Dashboard"
        variant="primary"
        onPress={() => router.dismissTo("/dashboard")}
      />
      <Action
        label="Open Journeys"
        onPress={() => router.dismissTo("/journeys")}
      />
    </FoldScreen>
  );
}
