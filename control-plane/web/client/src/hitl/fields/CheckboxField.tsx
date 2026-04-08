import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { HitlCheckboxField } from "../types";
import type { FieldComponentProps } from "./types";

export function CheckboxField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const checkboxField = field as HitlCheckboxField;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxField.name}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
          disabled={disabled || checkboxField.disabled}
        />
        <div className="space-y-1">
          {checkboxField.label ? <Label htmlFor={checkboxField.name}>{checkboxField.label}</Label> : null}
          {checkboxField.help ? <p className="text-sm text-muted-foreground">{checkboxField.help}</p> : null}
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
