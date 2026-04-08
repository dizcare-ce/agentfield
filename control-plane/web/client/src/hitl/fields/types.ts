import type { ComponentType } from "react";
import type { HitlField } from "../types";

export interface FieldComponentProps {
  field: HitlField;
  value: unknown;
  onChange: (next: unknown) => void;
  error?: string;
  disabled?: boolean;
  submitWithValue?: (value: unknown) => void;
}

export type FieldComponent = ComponentType<FieldComponentProps>;
