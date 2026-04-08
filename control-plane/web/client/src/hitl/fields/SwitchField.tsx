import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { HitlSwitchField } from "../types";
import type { FieldComponentProps } from "./types";

export function SwitchField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const switchField = field as HitlSwitchField;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <div className="space-y-1">
          {switchField.label ? <Label htmlFor={switchField.name}>{switchField.label}</Label> : null}
          {switchField.help ? <p className="text-sm text-muted-foreground">{switchField.help}</p> : null}
        </div>
        <Switch
          id={switchField.name}
          checked={value === true}
          onCheckedChange={onChange}
          disabled={disabled || switchField.disabled}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
