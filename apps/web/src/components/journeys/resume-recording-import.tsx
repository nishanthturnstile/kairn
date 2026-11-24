import type { RecordingImport } from "@kairn/contracts/recordings";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ButtonLink } from "@/components/ui/button";
import { hasRecordingDraft } from "@/lib/recording-draft";
import type { AccountScope } from "@/lib/session";

export function ResumeRecordingImport({
  scope,
  imports,
}: {
  scope: AccountScope;
  imports: { imports: RecordingImport[] } | null | undefined;
}) {
  const draft = useQuery({
    queryKey: [scope.accountId, "recording-draft-present"],
    queryFn: () =>
      scope.accountId ? hasRecordingDraft(scope.accountId) : false,
    refetchOnMount: "always",
    enabled: Boolean(imports),
  });
  const unfinished = imports?.imports.some(
    ({ stage }) =>
      stage === "ready" || stage === "queued" || stage === "failed",
  );
  if (!imports || (!draft.data && !unfinished)) return null;
  return (
    <ButtonLink
      variant="ghost"
      size="lg"
      render={
        <Link
          to="/journeys/import"
          search={{ resume: !draft.data || undefined }}
        />
      }
    >
      Resume import
    </ButtonLink>
  );
}
