import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { getHitlField } from "../fields/registry";
import "../fields/builtins";
import { UnknownField } from "../fields/UnknownField";
import { validate } from "../validation";
import { isHidden } from "../visibility";
import type { HitlField, HitlFormSchema } from "../types";

interface HitlFormRendererProps {
  schema: HitlFormSchema;
  initialValues?: Record<string, unknown>;
  mode: "edit" | "readonly";
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  externalErrors?: Record<string, string>;
}

function hasFieldName(field: HitlField): field is Extract<HitlField, { name: string }> {
  return "name" in field && typeof field.name === "string";
}

function getDefaultValue(field: HitlField): unknown {
  if (!hasFieldName(field)) return undefined;
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "checkbox":
    case "switch":
      return false;
    case "multiselect":
      return [];
    default:
      return "";
  }
}

function buildInitialValues(
  schema: HitlFormSchema,
  initialValues: Record<string, unknown> = {},
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (!hasFieldName(field)) continue;
    next[field.name] = initialValues[field.name] ?? getDefaultValue(field);
  }
  return next;
}

function stripHiddenValues(
  schema: HitlFormSchema,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...values };
  for (const field of schema.fields) {
    if (hasFieldName(field) && isHidden(field.hidden_when, next)) {
      delete next[field.name];
    }
  }
  return next;
}

export function HitlFormRenderer({
  schema,
  initialValues,
  mode,
  onSubmit,
  externalErrors,
}: HitlFormRendererProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(schema, initialValues),
  );
  const [errors, setErrors] = useState<Record<string, string>>(externalErrors ?? {});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setValues(buildInitialValues(schema, initialValues));
  }, [initialValues, schema]);

  useEffect(() => {
    setErrors(externalErrors ?? {});
  }, [externalErrors]);

  useEffect(() => {
    setValues((current) => stripHiddenValues(schema, current));
  }, [schema, values.decision]);

  const containsButtonGroup = schema.fields.some((field) => field.type === "button_group");
  const visibleFields = useMemo(
    () =>
      schema.fields.filter((field) =>
        !hasFieldName(field) ? true : !isHidden(field.hidden_when, values),
      ),
    [schema.fields, values],
  );

  const scrollToError = (fieldName: string) => {
    const node = document.querySelector(`[data-hitl-field="${fieldName}"]`);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const submitValues = async (nextValues: Record<string, unknown>) => {
    const prunedValues = stripHiddenValues(schema, nextValues);
    const result = validate(schema, prunedValues);
    if (!result.ok) {
      setErrors(result.errors);
      const firstError = Object.keys(result.errors)[0];
      if (firstError) scrollToError(firstError);
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(prunedValues);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="space-y-6 pb-28"
      onSubmit={(event) => {
        event.preventDefault();
        void submitValues(values);
      }}
    >
      {visibleFields.map((field, index) => {
        const Component = getHitlField(field.type) ?? UnknownField;
        const disabled = mode === "readonly" || (hasFieldName(field) && field.disabled) || submitting;
        const fieldValue = hasFieldName(field) ? values[field.name] : undefined;
        const fieldError = hasFieldName(field) ? errors[field.name] : undefined;

        return (
          <div
            key={hasFieldName(field) ? field.name : `${field.type}-${index}`}
            data-hitl-field={hasFieldName(field) ? field.name : undefined}
          >
            <Component
              field={field}
              value={fieldValue}
              onChange={(next) => {
                if (!hasFieldName(field)) return;
                setValues((current) => ({ ...current, [field.name]: next }));
                setErrors((current) => {
                  if (!current[field.name]) return current;
                  const nextErrors = { ...current };
                  delete nextErrors[field.name];
                  return nextErrors;
                });
              }}
              error={fieldError}
              disabled={disabled}
              submitWithValue={(next) => {
                if (!hasFieldName(field) || mode === "readonly") return;
                const nextValues = { ...values, [field.name]: next };
                setValues(nextValues);
                void submitValues(nextValues);
              }}
            />
          </div>
        );
      })}

      {mode === "edit" && !containsButtonGroup ? (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-6 py-4">
            {schema.cancel_label ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void submitValues({ ...values, _cancelled: true })}
                disabled={submitting}
              >
                {schema.cancel_label}
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting..." : schema.submit_label ?? "Submit"}
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
