import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function PasswordField({
  id,
  isNew,
  label = "Password",
  action,
}: {
  id: string;
  isNew: boolean;
  label?: string;
  action?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {action}
      </div>
      <div className="relative min-w-0">
        <Input
          id={id}
          name="password"
          className="min-w-0 pe-[calc(var(--spacing-touch)+0.375rem)]"
          type={visible ? "text" : "password"}
          autoComplete={isNew ? "new-password" : "current-password"}
          minLength={isNew ? 12 : undefined}
          aria-describedby={isNew ? `${id}-hint` : undefined}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute inset-y-0 end-0 text-muted-foreground hover:text-primary"
          aria-controls={id}
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible(!visible)}
        >
          {visible ? (
            <EyeOffIcon aria-hidden="true" />
          ) : (
            <EyeIcon aria-hidden="true" />
          )}
        </Button>
      </div>
      {isNew && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Use at least 12 characters.
        </p>
      )}
    </Field>
  );
}
