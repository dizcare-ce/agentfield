import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listHitlPending, type HitlInboxFilters } from "../api";
import { createHitlEventSource, type HitlPendingResolvedEvent } from "../sse";
import type { HitlPendingItem } from "../types";

function matchesFilters(item: HitlPendingItem, filters: HitlInboxFilters): boolean {
  const { tags, priority } = filters;
  if (priority && priority !== "all" && item.priority !== priority) return false;
  if (tags && tags.length > 0 && !tags.some((tag) => item.tags.includes(tag))) return false;
  return true;
}

export function useHitlInbox(filters: HitlInboxFilters) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["hitl", "pending", filters] as const, [filters]);

  const query = useQuery({
    queryKey,
    queryFn: () => listHitlPending(filters),
    staleTime: 10_000,
  });

  useEffect(() => {
    const source = createHitlEventSource();

    const handleAdded = (event: MessageEvent) => {
      const item = JSON.parse(event.data) as HitlPendingItem;
      if (!matchesFilters(item, filters)) return;
      queryClient.setQueryData<HitlPendingItem[]>(queryKey, (current = []) => {
        const next = current.filter((entry) => entry.request_id !== item.request_id);
        return [item, ...next];
      });
    };

    const handleResolved = (event: MessageEvent) => {
      const payload = JSON.parse(event.data) as HitlPendingResolvedEvent;
      queryClient.setQueryData<HitlPendingItem[]>(queryKey, (current = []) =>
        current.filter((entry) => entry.request_id !== payload.request_id),
      );
    };

    source.addEventListener("hitl.pending.added", handleAdded);
    source.addEventListener("hitl.pending.resolved", handleResolved);

    return () => {
      source.removeEventListener("hitl.pending.added", handleAdded);
      source.removeEventListener("hitl.pending.resolved", handleResolved);
      source.close();
    };
  }, [filters, queryClient, queryKey]);

  const tags = useMemo(() => {
    const unique = new Set<string>();
    for (const item of query.data ?? []) {
      item.tags.forEach((tag) => unique.add(tag));
    }
    return Array.from(unique).sort();
  }, [query.data]);

  return { ...query, items: query.data ?? [], availableTags: tags };
}
