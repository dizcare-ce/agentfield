import type { HitlHeadingField } from "../types";
import type { FieldComponentProps } from "./types";

export function HeadingField({ field }: FieldComponentProps) {
  const headingField = field as HitlHeadingField;
  return <h3 className="text-lg font-semibold">{headingField.text}</h3>;
}
