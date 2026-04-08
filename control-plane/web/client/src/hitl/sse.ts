import { getGlobalApiKey } from "@/services/api";
import type { HitlPendingItem } from "./types";

export interface HitlPendingResolvedEvent {
  request_id: string;
  decision?: string;
  responder?: string;
  responded_at?: string;
}

export type HitlStreamEvent =
  | { type: "hitl.pending.added"; data: HitlPendingItem }
  | { type: "hitl.pending.resolved"; data: HitlPendingResolvedEvent };

export function createHitlEventSource(): EventSource {
  const apiKey = getGlobalApiKey();
  const query = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
  return new EventSource(`/api/hitl/v1/stream${query}`);
}
