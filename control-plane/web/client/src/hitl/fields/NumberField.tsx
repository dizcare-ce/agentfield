import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HitlNumberField } from "../types";
import type { FieldComponentProps } from "./types";

export function NumberField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const numberField = field as HitlNumberField;

  return (
    <div className="space-y-2">
      {numberField.label ? <Label htmlFor={numberField.name}>{numberField.label}</Label> : null}
      <Input
        id={numberField.name}
        type="number"
        value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue === "" ? "" : Number(nextValue));
        }}
        min={numberField.min}
        max={numberField.max}
        step={numberField.step}
        disabled={disabled || numberField.disabled}
      />
      {numberField.help ? <p className="text-sm text-muted-foreground">{numberField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
