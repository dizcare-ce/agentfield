import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { HitlSelectField } from "../types";
import type { FieldComponentProps } from "./types";

export function SelectField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const selectField = field as HitlSelectField;

  return (
    <div className="space-y-2">
      {selectField.label ? <Label htmlFor={selectField.name}>{selectField.label}</Label> : null}
      <Select
        value={typeof value === "string" ? value : ""}
        onValueChange={onChange}
        disabled={disabled || selectField.disabled}
      >
        <SelectTrigger id={selectField.name}>
          <SelectValue placeholder={selectField.placeholder ?? "Select"} />
        </SelectTrigger>
        <SelectContent>
          {selectField.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selectField.help ? <p className="text-sm text-muted-foreground">{selectField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
