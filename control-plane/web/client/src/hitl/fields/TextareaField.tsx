import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { HitlTextareaField } from "../types";
import type { FieldComponentProps } from "./types";

export function TextareaField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const textareaField = field as HitlTextareaField;

  return (
    <div className="space-y-2">
      {textareaField.label ? <Label htmlFor={textareaField.name}>{textareaField.label}</Label> : null}
      <Textarea
        id={textareaField.name}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={textareaField.placeholder}
        rows={textareaField.rows ?? 3}
        maxLength={textareaField.max_length}
        disabled={disabled || textareaField.disabled}
      />
      {textareaField.help ? <p className="text-sm text-muted-foreground">{textareaField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
