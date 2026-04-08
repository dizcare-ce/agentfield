import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { HitlButtonGroupField } from "../types";
import type { FieldComponentProps } from "./types";

export function ButtonGroupField({
  field,
  value,
  onChange,
  error,
  disabled,
  submitWithValue,
}: FieldComponentProps) {
  const buttonGroupField = field as HitlButtonGroupField;

  return (
    <div className="space-y-3">
      {buttonGroupField.label ? <Label>{buttonGroupField.label}</Label> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        {buttonGroupField.options.map((option) => {
          const active = value === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="lg"
              className="flex-1"
              variant={active ? option.variant ?? "default" : option.variant ?? "secondary"}
              disabled={disabled || buttonGroupField.disabled}
              onClick={() => {
                onChange(option.value);
                submitWithValue?.(option.value);
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
      {buttonGroupField.help ? <p className="text-sm text-muted-foreground">{buttonGroupField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
