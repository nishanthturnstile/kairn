import { FoldMark } from "./fold-mark";
import { Skeleton } from "./skeleton";

export function LaunchFeedback() {
  return (
    <div role="status" className="fold-launch">
      <FoldMark moving /> Opening Kairn…
    </div>
  );
}

export function ContentLoading({ label }: { label: string }) {
  return (
    <output className="grid w-full min-w-0 gap-2 rounded-card border bg-card p-3">
      <span className="flex items-center gap-2 font-semibold">
        <FoldMark moving />
        {label}
      </span>
      <Skeleton className="h-2 w-full max-w-40" />
      <Skeleton className="h-2 w-full max-w-64" />
    </output>
  );
}
