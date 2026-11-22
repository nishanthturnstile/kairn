import { cn } from "cn";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Field, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";

export function PasswordField({
  id,
  isNew,
  label = "Password",
  large = false,
  readOnly = false,
}: {
  id: string;
  isNew: boolean;
  label?: string;
  large?: boolean;
  readOnly?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative min-w-0">
        <Input
          id={id}
          name="password"
          className={cn(
            "min-w-0 pe-[calc(var(--spacing-touch)+0.375rem)]",
            large && "min-h-touch",
          )}
          type={visible ? "text" : "password"}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete={isNew ? "new-password" : "current-password"}
          minLength={isNew ? 12 : undefined}
          aria-describedby={isNew ? `${id}-hint` : undefined}
          readOnly={readOnly}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size={large ? "icon-lg" : "icon"}
          className="absolute inset-y-0 end-0 my-auto text-muted-foreground hover:text-primary"
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
