import type { FieldComponent } from "./types";

const registry = new Map<string, FieldComponent>();

export function registerHitlField(type: string, component: FieldComponent): void {
  registry.set(type, component);
}

export function getHitlField(type: string): FieldComponent | undefined {
  return registry.get(type);
}
