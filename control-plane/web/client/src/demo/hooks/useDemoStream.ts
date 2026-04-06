/**
 * Streaming log simulation for demo mode.
 * Emits log lines at randomized intervals for a "live" feel.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO_TIMING } from '../constants';
import { generateLogLine } from '../mock/generators';
import type { DemoLogEntry, DemoLogTemplate, DemoAgentNodeConfig } from '../mock/types';

interface UseDemoStreamOptions {
  /** Whether streaming is enabled */
  enabled: boolean;
  /** Log templates for the current vertical */
  logTemplates: DemoLogTemplate[];
  /** Agent nodes for the current vertical */
  agentNodes: DemoAgentNodeConfig[];
}

interface UseDemoStreamReturn {
  /** Current log buffer (most recent last) */
  logs: DemoLogEntry[];
  /** Whether the stream is actively producing logs */
  isStreaming: boolean;
  /** Clear all logs */
  clearLogs: () => void;
}

export function useDemoStream({
  enabled,
  logTemplates,
  agentNodes,
}: UseDemoStreamOptions): UseDemoStreamReturn {
  const [logs, setLogs] = useState<DemoLogEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const scheduleNext = useCallback(() => {
    if (!enabledRef.current) return;

    const delay =
      DEMO_TIMING.LOG_INTERVAL_MIN_MS +
      Math.random() * (DEMO_TIMING.LOG_INTERVAL_MAX_MS - DEMO_TIMING.LOG_INTERVAL_MIN_MS);

    timerRef.current = setTimeout(() => {
      if (!enabledRef.current) return;
      // Don't emit when tab is hidden
      if (document.hidden) {
        scheduleNext();
        return;
      }

      const entry = generateLogLine(logTemplates, agentNodes);
      setLogs((prev) => {
        const next = [...prev, entry];
        // Trim to max buffer size
        return next.length > DEMO_TIMING.MAX_LOG_BUFFER
          ? next.slice(next.length - DEMO_TIMING.MAX_LOG_BUFFER)
          : next;
      });

      scheduleNext();
    }, delay);
  }, [logTemplates, agentNodes]);

  useEffect(() => {
    if (enabled && logTemplates.length > 0 && agentNodes.length > 0) {
      scheduleNext();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, scheduleNext, logTemplates.length, agentNodes.length]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return {
    logs,
    isStreaming: enabled,
    clearLogs,
  };
}
