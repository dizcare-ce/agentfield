import type { HiddenWhen } from "./visibility";

export type HitlPriority = "low" | "normal" | "high" | "urgent";
export type HitlButtonVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost"
  | "link";

export interface HitlChoiceOption {
  value: string;
  label: string;
}

export interface HitlButtonOption extends HitlChoiceOption {
  variant?: HitlButtonVariant;
}

export interface HitlNamedFieldBase<TType extends string, TDefault = unknown> {
  type: TType;
  name: string;
  label?: string;
  help?: string;
  required?: boolean;
  default?: TDefault;
  disabled?: boolean;
  hidden_when?: HiddenWhen;
}

export interface HitlMarkdownField {
  type: "markdown";
  content: string;
}

export interface HitlHeadingField {
  type: "heading";
  text: string;
}

export interface HitlDividerField {
  type: "divider";
}

export interface HitlTextField extends HitlNamedFieldBase<"text", string> {
  placeholder?: string;
  max_length?: number;
  pattern?: string;
}

export interface HitlTextareaField extends HitlNamedFieldBase<"textarea", string> {
  placeholder?: string;
  rows?: number;
  max_length?: number;
}

export interface HitlNumberField extends HitlNamedFieldBase<"number", number> {
  min?: number;
  max?: number;
  step?: number;
}

export interface HitlSelectField extends HitlNamedFieldBase<"select", string> {
  placeholder?: string;
  options: HitlChoiceOption[];
}

export interface HitlMultiSelectField extends HitlNamedFieldBase<"multiselect", string[]> {
  placeholder?: string;
  options: HitlChoiceOption[];
  min_items?: number;
  max_items?: number;
}

export interface HitlRadioField extends HitlNamedFieldBase<"radio", string> {
  options: HitlChoiceOption[];
}

export type HitlCheckboxField = HitlNamedFieldBase<"checkbox", boolean>;

export type HitlSwitchField = HitlNamedFieldBase<"switch", boolean>;

export interface HitlDateField extends HitlNamedFieldBase<"date", string> {
  min_date?: string;
  max_date?: string;
}

export interface HitlButtonGroupField extends HitlNamedFieldBase<"button_group", string> {
  options: HitlButtonOption[];
}

export interface HitlUnknownField {
  type: string;
  name?: string;
  label?: string;
  help?: string;
  required?: boolean;
  default?: unknown;
  disabled?: boolean;
  hidden_when?: HiddenWhen;
  [key: string]: unknown;
}

export type HitlField =
  | HitlMarkdownField
  | HitlHeadingField
  | HitlDividerField
  | HitlTextField
  | HitlTextareaField
  | HitlNumberField
  | HitlSelectField
  | HitlMultiSelectField
  | HitlRadioField
  | HitlCheckboxField
  | HitlSwitchField
  | HitlDateField
  | HitlButtonGroupField
  | HitlUnknownField;

export interface HitlFormSchema {
  title: string;
  description?: string;
  tags?: string[];
  priority?: HitlPriority;
  fields: HitlField[];
  submit_label?: string;
  cancel_label?: string;
}

export interface HitlPendingItem {
  request_id: string;
  execution_id: string;
  agent_node_id: string;
  workflow_id: string;
  title: string;
  description_preview?: string;
  tags: string[];
  priority: HitlPriority;
  requested_at: string;
  expires_at?: string;
}

export interface HitlResponsePayload {
  responder: string;
  response: Record<string, unknown>;
}

export interface HitlSubmitResult {
  status: string;
  decision?: string;
  execution_id: string;
}

export interface HitlDetail {
  request_id: string;
  execution_id?: string;
  agent_node_id?: string;
  workflow_id?: string;
  schema: HitlFormSchema;
  requested_at?: string;
  expires_at?: string;
  responded_at?: string;
  status: string;
  readonly: boolean;
  response?: Record<string, unknown>;
  responder?: string;
}

export interface HitlApiErrorBody {
  message?: string;
  error?: string;
  errors?: Record<string, string>;
}
