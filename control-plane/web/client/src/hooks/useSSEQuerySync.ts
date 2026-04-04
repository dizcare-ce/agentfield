import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSSE } from "./useSSE";

/**
 * Subscribes to execution and node SSE events and invalidates relevant
 * TanStack Query caches so pages auto-update without manual polling.
 * Mount once in AppLayout.
 */
export function useSSEQuerySync() {
  const queryClient = useQueryClient();

  // ── Execution events ────────────────────────────────────────────────────────
  const { latestEvent: execEvent, connected: execConnected } = useSSE(
    "/api/ui/v1/executions/events",
    {
      eventTypes: [
        "execution_completed",
        "execution_failed",
        "execution_started",
        "execution_updated",
        "execution_cancelled",
      ],
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelayMs: 2000,
      exponentialBackoff: true,
    },
  );

  useEffect(() => {
    if (!execEvent) return;

    // Always refresh the runs list so new/updated runs appear immediately
    queryClient.invalidateQueries({ queryKey: ["runs"] });

    // Narrow invalidation to the specific run when we have an identifier
    const data =
      execEvent.data && typeof execEvent.data === "object"
        ? (execEvent.data as Record<string, unknown>)
        : {};

    const runId = (data.run_id ?? data.workflow_id) as string | undefined;
    const execId = data.execution_id as string | undefined;

    if (runId) {
      queryClient.invalidateQueries({ queryKey: ["run-dag", runId] });
    }
    if (execId) {
      queryClient.invalidateQueries({ queryKey: ["step-detail", execId] });
    }
  }, [execEvent, queryClient]);

  // ── Node / agent events ─────────────────────────────────────────────────────
  const { latestEvent: nodeEvent, connected: nodeConnected } = useSSE(
    "/api/ui/v1/nodes/events",
    {
      eventTypes: [
        "node_online",
        "node_offline",
        "node_health_changed",
        "node_unified_status_changed",
        "node_registered",
        "node_removed",
      ],
      autoReconnect: true,
      maxReconnectAttempts: 10,
      reconnectDelayMs: 2000,
      exponentialBackoff: true,
    },
  );

  useEffect(() => {
    if (!nodeEvent) return;
    queryClient.invalidateQueries({ queryKey: ["agents"] });
  }, [nodeEvent, queryClient]);

  return {
    execConnected,
    nodeConnected,
    /** True when at least one SSE channel is live */
    anyConnected: execConnected || nodeConnected,
  };
}
