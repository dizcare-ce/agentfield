export type HiddenWhen =
  | { field: string; equals: unknown }
  | { field: string; notEquals: unknown }
  | { field: string; in: unknown[] }
  | { field: string; notIn: unknown[] };

// v1 supports only a single flat predicate. Composite all/any rules can layer on later.
export function isHidden(
  rule: HiddenWhen | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!rule) return false;

  const current = values[rule.field];
  if ("equals" in rule) return current === rule.equals;
  if ("notEquals" in rule) return current !== rule.notEquals;
  if ("in" in rule) return rule.in.includes(current);
  if ("notIn" in rule) return !rule.notIn.includes(current);
  return false;
}
