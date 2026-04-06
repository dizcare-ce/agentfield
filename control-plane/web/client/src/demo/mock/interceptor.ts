/**
 * Demo mode mock data interceptor.
 * Provides helper functions for React Query hooks to return mock data
 * when demo mode is active, instead of hitting the real API.
 */

import type { DemoScenario, DemoVertical } from './types';
import { generateAgentNodes, generateAgentNodeDetails, generateRuns, generateDAGResponse } from './generators';
import type { AgentNodeSummary, AgentNode } from '../../types/agentfield';
import type { WorkflowSummary, WorkflowDAGLightweightResponse, WorkflowsResponse } from '../../types/workflows';

import { saasScenario } from './scenarios/saas';
import { healthcareScenario } from './scenarios/healthcare';
import { financeScenario } from './scenarios/finance';

// ─── Scenario Registry ──────────────────────────────────────────────────────

const SCENARIOS: Record<DemoVertical, DemoScenario> = {
  saas: saasScenario,
  healthcare: healthcareScenario,
  finance: financeScenario,
};

export function getScenario(vertical: DemoVertical): DemoScenario {
  return SCENARIOS[vertical];
}

// ─── Cached Demo Data ───────────────────────────────────────────────────────
// Generated once per vertical switch, reused across hook calls.

interface DemoDataCache {
  vertical: DemoVertical;
  agentNodes: AgentNodeSummary[];
  agentNodeDetails: Map<string, AgentNode>;
  runs: WorkflowSummary[];
  heroRunId: string;
  failedRunId: string;
  monsterRunId: string;
}

let cache: DemoDataCache | null = null;

export function getDemoData(vertical: DemoVertical): DemoDataCache {
  if (cache && cache.vertical === vertical) return cache;

  const scenario = SCENARIOS[vertical];
  const agentNodes = generateAgentNodes(scenario.agentNodes);
  const agentNodeDetails = new Map<string, AgentNode>();
  for (const config of scenario.agentNodes) {
    agentNodeDetails.set(config.id, generateAgentNodeDetails(config));
  }

  const runs = generateRuns(scenario, 100);

  // First succeeded run is hero, first failed is for comparison, find the big one for monster
  const heroRun = runs.find((r) => r.status === 'succeeded' && r.total_executions >= 30);
  const failedRun = runs.find((r) => r.status === 'failed');
  const monsterRun = runs.find((r) => r.status === 'succeeded' && r.total_executions >= 100);

  cache = {
    vertical,
    agentNodes,
    agentNodeDetails,
    runs,
    heroRunId: heroRun?.run_id ?? runs[0]?.run_id ?? 'demo-hero',
    failedRunId: failedRun?.run_id ?? runs[1]?.run_id ?? 'demo-failed',
    monsterRunId: monsterRun?.run_id ?? runs[2]?.run_id ?? 'demo-monster',
  };

  return cache;
}

/** Invalidate the cache (e.g., on vertical switch). */
export function clearDemoCache(): void {
  cache = null;
}

// ─── Hook-Level Mock Data Providers ─────────────────────────────────────────

/** Mock data for useAgents hook */
export function getDemoAgentNodes(vertical: DemoVertical): AgentNodeSummary[] {
  return getDemoData(vertical).agentNodes;
}

/** Mock data for agent detail queries */
export function getDemoAgentNodeDetail(vertical: DemoVertical, nodeId: string): AgentNode | undefined {
  return getDemoData(vertical).agentNodeDetails.get(nodeId);
}

/** Mock data for useRuns hook */
export function getDemoRuns(vertical: DemoVertical): WorkflowsResponse {
  const data = getDemoData(vertical);
  return {
    workflows: data.runs,
    total_count: data.runs.length,
    page: 1,
    page_size: data.runs.length,
    total_pages: 1,
  };
}

/** Mock data for useRunDAG hook */
export function getDemoRunDAG(vertical: DemoVertical, runId: string): WorkflowDAGLightweightResponse {
  const data = getDemoData(vertical);
  const scenario = SCENARIOS[vertical];
  const run = data.runs.find((r) => r.run_id === runId);

  // Use hero topology for recognized hero/monster runs, else use a random template
  let topology = scenario.heroRun.topology;
  let displayName = run?.display_name ?? 'Demo Run';

  if (runId === data.monsterRunId) {
    topology = scenario.monsterRun.topology;
    displayName = scenario.monsterRun.displayName;
  }

  return generateDAGResponse(
    runId,
    topology,
    run?.status ?? 'succeeded',
    scenario.agentNodes,
    displayName,
  );
}

/** Get IDs for the storyline beats */
export function getDemoRunIds(vertical: DemoVertical) {
  const data = getDemoData(vertical);
  return {
    heroRunId: data.heroRunId,
    failedRunId: data.failedRunId,
    monsterRunId: data.monsterRunId,
  };
}

// ─── Query Function Wrapper ─────────────────────────────────────────────────

/**
 * Wraps a real queryFn with demo mode interception.
 * When isDemoMode is true, returns demoData immediately.
 * Otherwise, calls the real queryFn.
 */
export function createDemoQueryFn<T>(
  isDemoMode: boolean,
  demoData: T,
  realQueryFn: () => Promise<T>,
): () => Promise<T> {
  return isDemoMode ? () => Promise.resolve(demoData) : realQueryFn;
}
