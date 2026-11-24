import { cn } from "cn";
import { FileUpIcon, UploadIcon } from "lucide-react";
import { type ReactNode, type Ref, useId } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "./button";

// Adapted from Kibo UI's MIT-licensed Dropzone.
export function Dropzone({
  accept,
  label,
  heading,
  leading,
  description,
  touchDescription,
  hint,
  compact = false,
  disabled = false,
  onFiles,
  onError,
  chooseRef,
}: {
  accept: string;
  label: string;
  heading?: ReactNode;
  leading?: ReactNode;
  description: string;
  touchDescription?: string;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  onError: () => void;
  chooseRef?: Ref<HTMLButtonElement>;
}) {
  const descriptionId = useId();
  const hintId = useId();
  const inline = compact && Boolean(leading);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    multiple: true,
    disabled,
    noClick: true,
    noKeyboard: true,
    noPaste: true,
    onDrop: onFiles,
    onError,
  });

  return (
    <div
      {...getRootProps({
        className: cn(
          "min-w-0 rounded-card border transition-colors motion-reduce:transition-none",
          inline
            ? "border-transparent"
            : "border-dashed border-input bg-muted/40",
          compact
            ? cn(
                "flex flex-wrap items-center justify-between gap-x-2",
                inline ? "gap-y-1" : "gap-y-2 p-3",
              )
            : "grid justify-items-center gap-2 px-4 py-6 text-center sm:py-10",
          isDragActive && "border-ring bg-accent text-accent-foreground",
        ),
      })}
    >
      <input
        {...getInputProps({
          accept,
          "aria-label": label,
          className: "sr-only",
        })}
      />
      {heading && (
        <>
          <FileUpIcon aria-hidden="true" className="mb-1 size-7" />
          {heading}
        </>
      )}
      {inline && <div className="min-w-0">{leading}</div>}
      <p
        id={descriptionId}
        className={cn(
          "max-w-sm text-sm",
          inline &&
            (isDragActive ? "order-last basis-full px-2 pb-1" : "sr-only"),
        )}
      >
        {isDragActive ? (
          "Release to add files"
        ) : touchDescription ? (
          <>
            <span className="[@media(pointer:coarse)]:hidden">
              {description}
            </span>
            <span className="hidden [@media(pointer:coarse)]:inline">
              {touchDescription}
            </span>
          </>
        ) : (
          description
        )}
      </p>
      <Button
        className={cn("transition-none!", inline && "bg-secondary")}
        ref={chooseRef}
        type="button"
        size={compact ? "default" : "lg"}
        variant={compact ? "outline" : "default"}
        disabled={disabled}
        onClick={open}
        aria-describedby={hint ? `${descriptionId} ${hintId}` : descriptionId}
      >
        <UploadIcon aria-hidden="true" data-icon="inline-start" />
        {compact ? "Add files" : "Choose files"}
      </Button>
      {hint && (
        <p id={hintId} className="max-w-sm text-sm">
          {hint}
        </p>
      )}
    </div>
  );
}
