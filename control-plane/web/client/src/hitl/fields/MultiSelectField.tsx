import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { HitlMultiSelectField } from "../types";
import type { FieldComponentProps } from "./types";

export function MultiSelectField({
  field,
  value,
  onChange,
  error,
  disabled,
}: FieldComponentProps) {
  const [open, setOpen] = useState(false);
  const multiSelectField = field as HitlMultiSelectField;
  const selectedValues = useMemo(
    () => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []),
    [value],
  );

  const selectedLabels = multiSelectField.options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);

  return (
    <div className="space-y-2">
      {multiSelectField.label ? <Label>{multiSelectField.label}</Label> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between"
            disabled={disabled || multiSelectField.disabled}
          >
            <span className="truncate">
              {selectedLabels.length > 0 ? selectedLabels.join(", ") : multiSelectField.placeholder ?? "Select options"}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search options..." />
            <CommandList>
              <CommandEmpty>No options found.</CommandEmpty>
              <CommandGroup>
                {multiSelectField.options.map((option) => {
                  const checked = selectedValues.includes(option.value);
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      onSelect={() => {
                        const next = checked
                          ? selectedValues.filter((entry) => entry !== option.value)
                          : [...selectedValues, option.value];
                        onChange(next);
                      }}
                    >
                      <Checkbox checked={checked} className="mr-2" />
                      <span className="flex-1">{option.label}</span>
                      {checked ? <Check className="size-4 opacity-50" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {multiSelectField.help ? <p className="text-sm text-muted-foreground">{multiSelectField.help}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
