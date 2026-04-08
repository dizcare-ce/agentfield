import type { HitlMarkdownField } from "../types";
import type { FieldComponentProps } from "./types";
import { HitlMarkdown } from "../components/HitlMarkdown";

export function MarkdownField({ field }: FieldComponentProps) {
  const markdownField = field as HitlMarkdownField;
  return <HitlMarkdown content={markdownField.content} />;
}
