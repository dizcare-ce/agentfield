import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { HitlDateField } from "../types";
import type { FieldComponentProps } from "./types";

function dateToValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function valueToDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDate(value: string | undefined): string {
  if (!value) return "Pick a date";
  const date = valueToDate(value);
  return date
    ? new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date)
    : "Pick a date";
}

export function DateField({ field, value, onChange, error, disabled }: FieldComponentProps) {
  const dateField = field as HitlDateField;
  const selected = typeof value === "string" ? value : undefined;

  return (
    <div className="space-y-2">
      {dateField.label ? <Label>{dateField.label}</Label> : null}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start text-left font-normal"
            disabled={disabled || dateField.disabled}
          >
            <CalendarIcon className="mr-2 size-4" />
            {formatDate(selected)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={valueToDate(selected)}
            onSelect={(next) => onChange(next ? dateToValue(next) : "")}
            disabled={(date) => {
              const iso = dateToValue(date);
              if (dateField.min_date && iso < dateField.min_date) return true;
              if (dateField.max_date && iso > dateField.max_date) return true;
              return false;
            }}
          />
        </PopoverContent>
      </Popover>
      {dateField.help ? <p className="text-sm text-muted-foreground">{dateField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
