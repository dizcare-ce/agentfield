import { getGlobalApiKey } from "@/services/api";
import type {
  HitlApiErrorBody,
  HitlDetail,
  HitlPendingItem,
  HitlPriority,
  HitlResponsePayload,
  HitlSubmitResult,
} from "./types";

const HITL_API_BASE = "/api/hitl/v1";

export interface HitlInboxFilters {
  tags?: string[];
  priority?: HitlPriority | "all";
  limit?: number;
  offset?: number;
}

export class HitlApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "HitlApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

async function hitlFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  const apiKey = getGlobalApiKey();
  if (apiKey) {
    headers.set("X-API-Key", apiKey);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${HITL_API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as HitlApiErrorBody | null;
    const message =
      errorBody?.message ??
      errorBody?.error ??
      `Request failed with status ${response.status}`;
    throw new HitlApiError(response.status, message, errorBody?.errors ?? {});
  }

  return response.json() as Promise<T>;
}

function buildQueryString(filters: HitlInboxFilters): string {
  const params = new URLSearchParams();
  filters.tags?.forEach((tag) => params.append("tag", tag));
  if (filters.priority && filters.priority !== "all") {
    params.set("priority", filters.priority);
  }
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  if (typeof filters.offset === "number") params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function listHitlPending(
  filters: HitlInboxFilters = {},
): Promise<HitlPendingItem[]> {
  // Backend returns an envelope: { items: HitlPendingItem[] }.
  // Unwrap here so callers (and the react-query cache) see a plain array.
  const response = await hitlFetch<{ items?: HitlPendingItem[] } | HitlPendingItem[]>(
    `/pending${buildQueryString(filters)}`,
  );
  if (Array.isArray(response)) return response;
  return response.items ?? [];
}

export function getHitlItem(requestId: string): Promise<HitlDetail> {
  return hitlFetch<HitlDetail>(`/pending/${encodeURIComponent(requestId)}`);
}

export function submitHitlResponse(
  requestId: string,
  payload: HitlResponsePayload,
): Promise<HitlSubmitResult> {
  return hitlFetch<HitlSubmitResult>(`/pending/${encodeURIComponent(requestId)}/respond`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
