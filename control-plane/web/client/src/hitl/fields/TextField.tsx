import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HitlTextField } from "../types";
import type { FieldComponentProps } from "./types";

export function TextField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const textField = field as HitlTextField;

  return (
    <div className="space-y-2">
      {textField.label ? <Label htmlFor={textField.name}>{textField.label}</Label> : null}
      <Input
        id={textField.name}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={textField.placeholder}
        maxLength={textField.max_length}
        disabled={disabled || textField.disabled}
      />
      {textField.help ? <p className="text-sm text-muted-foreground">{textField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
