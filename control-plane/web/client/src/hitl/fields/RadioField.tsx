import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { HitlRadioField } from "../types";
import type { FieldComponentProps } from "./types";

export function RadioField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const radioField = field as HitlRadioField;

  return (
    <div className="space-y-3">
      {radioField.label ? <Label>{radioField.label}</Label> : null}
      <RadioGroup
        value={typeof value === "string" ? value : ""}
        onValueChange={onChange}
        disabled={disabled || radioField.disabled}
      >
        {radioField.options.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <RadioGroupItem id={`${radioField.name}-${option.value}`} value={option.value} />
            <Label htmlFor={`${radioField.name}-${option.value}`}>{option.label}</Label>
          </div>
        ))}
      </RadioGroup>
      {radioField.help ? <p className="text-sm text-muted-foreground">{radioField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
