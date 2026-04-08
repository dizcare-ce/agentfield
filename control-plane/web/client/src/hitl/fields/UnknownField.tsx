import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { FieldComponentProps } from "./types";

export function UnknownField({ field }: FieldComponentProps) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Unknown field type</AlertTitle>
      <AlertDescription>
        Unknown field type: {field.type}. Did you forget to register a custom field?
      </AlertDescription>
    </Alert>
  );
}
