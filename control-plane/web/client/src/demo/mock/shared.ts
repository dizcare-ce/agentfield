/**
 * Shared utilities for generating realistic demo mock data.
 * All functions are pure and deterministic when given the same seed.
 */

/** Generate a UUID-like ID */
export function generateId(): string {
  // Use crypto.randomUUID if available, else fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Generate a short ID prefix (8 chars) for display */
export function shortId(): string {
  return generateId().slice(0, 8);
}

/** Generate an ISO timestamp relative to now */
export function generateTimestamp(minutesAgo: number): string {
  const date = new Date(Date.now() - minutesAgo * 60 * 1000);
  return date.toISOString();
}

/** Generate a timestamp within a range (minutesAgo) */
export function generateTimestampInRange(minMinutesAgo: number, maxMinutesAgo: number): string {
  const minutesAgo = randomBetween(minMinutesAgo, maxMinutesAgo);
  return generateTimestamp(minutesAgo);
}

/** Random integer between min and max (inclusive) */
export function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random float between min and max */
export function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Pick a random element from an array */
export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Pick N unique random elements from an array */
export function pickRandomN<T>(arr: readonly T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

/**
 * Generate a realistic duration in ms within a range.
 * Uses a skewed distribution — most runs are faster, some are slow.
 */
export function generateDuration(minMs: number, maxMs: number): number {
  const t = Math.random();
  const skewed = t * t; // Skews toward lower values
  return Math.round(minMs + skewed * (maxMs - minMs));
}

/**
 * Return a weighted random status matching real-world distribution.
 * @param successRate - fraction of succeeded (default 0.85)
 */
export function weightedStatus(
  successRate = 0.85,
): 'succeeded' | 'failed' | 'timeout' | 'cancelled' {
  const r = Math.random();
  if (r < successRate) return 'succeeded';
  if (r < successRate + 0.08) return 'failed';
  if (r < successRate + 0.12) return 'timeout';
  return 'cancelled';
}

/**
 * Generate status counts for a WorkflowSummary given total executions and final status.
 * Returns a record mapping status strings to execution counts.
 */
export function generateStatusCounts(
  totalExecutions: number,
  finalStatus: string,
): Record<string, number> {
  if (finalStatus === 'succeeded') {
    return { succeeded: totalExecutions };
  }
  if (finalStatus === 'failed') {
    // Most succeeded, one or two failed
    const failedCount = randomBetween(1, 3);
    return {
      succeeded: Math.max(0, totalExecutions - failedCount),
      failed: failedCount,
    };
  }
  if (finalStatus === 'timeout') {
    return {
      succeeded: Math.max(0, totalExecutions - 1),
      timeout: 1,
    };
  }
  if (finalStatus === 'cancelled') {
    const completedBefore = randomBetween(1, Math.max(1, totalExecutions - 2));
    return {
      succeeded: completedBefore,
      cancelled: totalExecutions - completedBefore,
    };
  }
  return { [finalStatus]: totalExecutions };
}

/** Consistent color palette for agent nodes in the DAG */
export const COLOR_PALETTE = [
  'hsl(221, 83%, 53%)', // blue
  'hsl(142, 71%, 45%)', // green
  'hsl(38, 92%, 50%)',  // amber
  'hsl(0, 84%, 60%)',   // red
  'hsl(280, 68%, 60%)', // purple
  'hsl(190, 90%, 50%)', // cyan
  'hsl(330, 81%, 60%)', // pink
  'hsl(45, 93%, 47%)',  // yellow
] as const;

/** Mutable color assignment map for agent nodes — populated lazily by getAgentNodeColor */
export const AGENT_NODE_COLORS: Record<string, string> = {};

let colorIndex = 0;

/**
 * Get a consistent color for an agent node ID.
 * Colors are assigned round-robin from COLOR_PALETTE and memoized per nodeId.
 */
export function getAgentNodeColor(nodeId: string): string {
  if (!AGENT_NODE_COLORS[nodeId]) {
    AGENT_NODE_COLORS[nodeId] = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
    colorIndex++;
  }
  return AGENT_NODE_COLORS[nodeId];
}

/**
 * Format a timestamp as relative time (e.g., "2m ago", "1h ago", "3d ago").
 * @param isoTimestamp - ISO 8601 timestamp string
 */
export function relativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Create a seeded pseudo-random number generator for deterministic sequences.
 * Useful for generating consistent demo data across page reloads.
 * @param seed - Integer seed value
 * @returns A function that returns a float in [0, 1) on each call
 */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
