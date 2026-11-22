import { CairnMark } from "./cairn-logo";
import { Skeleton } from "./skeleton";

export function LaunchFeedback() {
  return (
    <div role="status" className="fold-launch">
      <CairnMark moving /> Opening Kairn…
    </div>
  );
}

export function ContentLoading({ label }: { label: string }) {
  return (
    <output className="grid w-full min-w-0 gap-2 rounded-card border bg-card p-3">
      <span className="flex items-center gap-2 font-semibold">
        <CairnMark moving />
        {label}
      </span>
      <Skeleton className="h-2 w-full max-w-40" />
      <Skeleton className="h-2 w-full max-w-64" />
    </output>
  );
}
