import { isHidden } from "./visibility";
import type {
  HitlButtonGroupField,
  HitlCheckboxField,
  HitlDateField,
  HitlField,
  HitlFormSchema,
  HitlMultiSelectField,
  HitlNumberField,
  HitlRadioField,
  HitlSelectField,
  HitlSwitchField,
  HitlTextField,
  HitlTextareaField,
} from "./types";

export interface HitlValidationResult {
  ok: boolean;
  errors: Record<string, string>;
}

function hasFieldName(field: HitlField): field is Extract<HitlField, { name: string }> {
  return "name" in field && typeof field.name === "string" && field.name.length > 0;
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function validateRequired(field: Extract<HitlField, { name: string }>, value: unknown): string | undefined {
  if (!field.required) return undefined;
  if (field.type === "checkbox" || field.type === "switch") {
    return value === true ? undefined : "This field is required.";
  }
  return isEmptyValue(value) ? "This field is required." : undefined;
}

function validateText(field: HitlTextField | HitlTextareaField, value: unknown): string | undefined {
  if (typeof value !== "string") return "Enter text.";
  if (field.max_length && value.length > field.max_length) {
    return `Must be ${field.max_length} characters or fewer.`;
  }
  if ("pattern" in field && field.pattern) {
    const regex = new RegExp(field.pattern);
    if (!regex.test(value)) return "Enter a valid value.";
  }
  return undefined;
}

function validateNumber(field: HitlNumberField, value: unknown): string | undefined {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "Enter a number.";
  if (field.min !== undefined && numeric < field.min) return `Must be at least ${field.min}.`;
  if (field.max !== undefined && numeric > field.max) return `Must be at most ${field.max}.`;
  return undefined;
}

function validateSingleChoice(
  field: HitlSelectField | HitlRadioField | HitlButtonGroupField,
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return "Select an option.";
  const valid = field.options.some((option) => option.value === value);
  return valid ? undefined : "Select a valid option.";
}

function validateMultiSelect(field: HitlMultiSelectField, value: unknown): string | undefined {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return "Select one or more options.";
  }
  const allowed = new Set(field.options.map((option) => option.value));
  if (value.some((entry) => !allowed.has(entry))) return "Select valid options.";
  if (field.min_items !== undefined && value.length < field.min_items) {
    return `Select at least ${field.min_items}.`;
  }
  if (field.max_items !== undefined && value.length > field.max_items) {
    return `Select at most ${field.max_items}.`;
  }
  return undefined;
}

function validateDate(field: HitlDateField, value: unknown): string | undefined {
  if (typeof value !== "string") return "Choose a date.";
  if (field.min_date && value < field.min_date) return `Date must be on or after ${field.min_date}.`;
  if (field.max_date && value > field.max_date) return `Date must be on or before ${field.max_date}.`;
  return undefined;
}

function validateBoolean(_field: HitlCheckboxField | HitlSwitchField, value: unknown): string | undefined {
  return typeof value === "boolean" ? undefined : "Choose yes or no.";
}

export function validate(
  schema: HitlFormSchema,
  values: Record<string, unknown>,
): HitlValidationResult {
  const errors: Record<string, string> = {};

  for (const field of schema.fields) {
    if (!hasFieldName(field) || field.disabled || isHidden(field.hidden_when, values)) {
      continue;
    }

    const value = values[field.name];
    const requiredError = validateRequired(field, value);
    if (requiredError) {
      errors[field.name] = requiredError;
      continue;
    }
    if (isEmptyValue(value)) continue;

    let error: string | undefined;
    switch (field.type) {
      case "text":
      case "textarea":
        error = validateText(field, value);
        break;
      case "number":
        error = validateNumber(field, value);
        break;
      case "select":
      case "radio":
      case "button_group":
        error = validateSingleChoice(field, value);
        break;
      case "multiselect":
        error = validateMultiSelect(field, value);
        break;
      case "date":
        error = validateDate(field, value);
        break;
      case "checkbox":
      case "switch":
        error = validateBoolean(field, value);
        break;
      default:
        error = undefined;
    }

    if (error) {
      errors[field.name] = error;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}
