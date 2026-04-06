/**
 * Mock data generators for AgentField demo mode.
 * All functions return objects matching the exact TypeScript types the UI expects.
 */

import type { AgentNode, AgentNodeSummary, ReasonerDefinition } from '../../types/agentfield';
import type {
  WorkflowSummary,
  WorkflowDAGLightweightNode,
  WorkflowDAGLightweightResponse,
} from '../../types/workflows';
import type {
  DemoScenario,
  DemoAgentNodeConfig,
  DemoRunTemplate,
  DemoDAGTopology,
  DemoLogTemplate,
  DemoLogEntry,
} from './types';
import {
  generateId,
  generateTimestamp,
  randomBetween,
  randomFloat,
  weightedStatus,
  generateDuration,
  generateStatusCounts,
  pickRandom,
} from './shared';

// ─── Agent Node Generators ──────────────────────────────────────────────────

/** Convert DemoAgentNodeConfig[] to AgentNodeSummary[] matching real API shape. */
export function generateAgentNodes(configs: DemoAgentNodeConfig[]): AgentNodeSummary[] {
  return configs.map((config) => ({
    id: config.id,
    base_url: `http://${config.id}:8080`,
    version: config.version ?? '1.0.0',
    team_id: 'demo-team',
    health_status: 'active' as const,
    lifecycle_status: 'ready' as const,
    last_heartbeat: generateTimestamp(randomFloat(0.1, 1)),
    deployment_type: config.deploymentType ?? 'long_running',
    reasoner_count: config.reasoners.length,
    skill_count: 0,
  }));
}

/** Generate a full AgentNode with reasoners populated from config. */
export function generateAgentNodeDetails(config: DemoAgentNodeConfig): AgentNode {
  const reasoners: ReasonerDefinition[] = config.reasoners.map((r) => ({
    id: r.id,
    name: r.displayName,
    description: r.description,
    tags: [],
    input_schema: r.inputSchema ?? { type: 'object', properties: { input: { type: 'string' } } },
  }));

  return {
    id: config.id,
    base_url: `http://${config.id}:8080`,
    version: config.version ?? '1.0.0',
    health_status: 'active',
    lifecycle_status: 'ready',
    last_heartbeat: generateTimestamp(randomFloat(0.1, 1)),
    registered_at: generateTimestamp(7 * 24 * 60),
    deployment_type: config.deploymentType ?? 'long_running',
    reasoners,
    skills: [],
  };
}

// ─── Run Generators ─────────────────────────────────────────────────────────

/** Build a WorkflowSummary from a run template and resolved status. */
function buildWorkflowSummary(
  runId: string,
  template: DemoRunTemplate,
  status: string,
  startedAt: string,
): WorkflowSummary {
  const isTerminal = !['running', 'pending'].includes(status);
  const durationMs = isTerminal
    ? generateDuration(template.durationRange[0], template.durationRange[1])
    : undefined;

  const startMs = new Date(startedAt).getTime();
  const latestMs = durationMs
    ? startMs + durationMs
    : startMs + randomBetween(100, 5000);
  const completedAt = isTerminal ? new Date(latestMs).toISOString() : undefined;

  const totalExecutions = template.topology.expectedNodeCount;
  const statusCounts = generateStatusCounts(totalExecutions, status);

  return {
    run_id: runId,
    workflow_id: generateId(),
    root_execution_id: generateId(),
    status: status as WorkflowSummary['status'],
    root_reasoner: template.rootReasoner,
    current_task: template.rootReasoner,
    total_executions: totalExecutions,
    max_depth: Math.max(...template.topology.edges.map((_, i) => i).slice(0, 10), 1),
    started_at: startedAt,
    latest_activity: new Date(latestMs).toISOString(),
    completed_at: completedAt,
    duration_ms: durationMs,
    display_name: template.displayName,
    agent_id: template.agentNodeId,
    agent_name: template.agentNodeId,
    session_id: generateId(),
    actor_id: 'demo-user',
    status_counts: statusCounts,
    active_executions: isTerminal ? 0 : randomBetween(1, 3),
    terminal: isTerminal,
  };
}

/**
 * Generate `count` WorkflowSummary objects from a scenario.
 * Includes hero run and monster run as pinned entries.
 */
export function generateRuns(scenario: DemoScenario, count: number): WorkflowSummary[] {
  const runs: WorkflowSummary[] = [];

  // Pin hero run — recent, succeeded
  const heroId = generateId();
  runs.push(buildWorkflowSummary(
    heroId,
    scenario.heroRun,
    'succeeded',
    generateTimestamp(randomBetween(2, 5)),
  ));

  // Pin monster run — older, succeeded (shows scale)
  const monsterId = generateId();
  runs.push(buildWorkflowSummary(
    monsterId,
    scenario.monsterRun,
    'succeeded',
    generateTimestamp(randomBetween(60, 180)),
  ));

  // Pin a failed run for comparison
  const failedTemplate = pickRandom(scenario.runTemplates);
  const failedId = generateId();
  runs.push(buildWorkflowSummary(
    failedId,
    failedTemplate,
    'failed',
    generateTimestamp(randomBetween(3, 8)),
  ));

  // Fill remaining with random runs over 7 days
  const remaining = count - runs.length;
  for (let i = 0; i < remaining; i++) {
    const template = pickRandom(scenario.runTemplates);
    const status = weightedStatus();
    // Skew toward recent: squared random over 7 days
    const r = Math.random();
    const minutesAgo = r * r * 7 * 24 * 60;
    runs.push(buildWorkflowSummary(generateId(), template, status, generateTimestamp(minutesAgo)));
  }

  // Sort by started_at descending
  runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  return runs;
}

// ─── DAG Timeline Generators ────────────────────────────────────────────────

/**
 * Convert a DemoDAGTopology (edge list) into WorkflowDAGLightweightNode[].
 * Computes depth from edge structure, assigns realistic timestamps.
 */
export function generateDAGTimeline(
  topology: DemoDAGTopology,
  runStatus: string,
  _agentNodes: DemoAgentNodeConfig[],
): WorkflowDAGLightweightNode[] {
  const { edges } = topology;
  if (edges.length === 0) return [];

  const isTerminal = ['succeeded', 'failed', 'cancelled', 'timeout'].includes(runStatus);

  // Build a map of reasonerId -> { agentNodeId, depth, parentReasonerId }
  type NodeInfo = { reasonerId: string; agentNodeId: string; depth: number; parentReasonerId: string | null };
  const nodeMap = new Map<string, NodeInfo>();

  // First pass: create nodes and compute depths
  for (const [parentId, childId, agentNodeId] of edges) {
    if (!nodeMap.has(childId)) {
      const parentDepth = parentId ? (nodeMap.get(parentId)?.depth ?? 0) : -1;
      nodeMap.set(childId, {
        reasonerId: childId,
        agentNodeId,
        depth: parentDepth + 1,
        parentReasonerId: parentId,
      });
    }
  }

  const nodes = [...nodeMap.values()].sort((a, b) => a.depth - b.depth);
  const maxDepth = Math.max(...nodes.map((n) => n.depth), 0);
  const totalDurationMs = generateDuration(3000, 20000);
  const timePerDepth = totalDurationMs / Math.max(maxDepth + 1, 1);
  const baseTime = Date.now() - totalDurationMs - randomBetween(2000, 10000);

  // Pick a random node to be "failed" if run failed
  const failNodeIdx = runStatus === 'failed'
    ? randomBetween(Math.floor(nodes.length * 0.6), nodes.length - 1)
    : -1;

  return nodes.map((node, idx) => {
    const startMs = baseTime + node.depth * timePerDepth + randomBetween(0, Math.floor(timePerDepth * 0.3));
    const nodeDuration = generateDuration(100, Math.floor(timePerDepth * 0.8));
    const endMs = startMs + nodeDuration;

    let nodeStatus: string;
    if (!isTerminal && idx === nodes.length - 1) {
      nodeStatus = 'running';
    } else if (idx === failNodeIdx) {
      nodeStatus = runStatus;
    } else if (idx > failNodeIdx && failNodeIdx >= 0) {
      nodeStatus = 'cancelled';
    } else {
      nodeStatus = 'succeeded';
    }

    const nodeIsTerminal = !['running', 'pending'].includes(nodeStatus);

    // Find parent execution ID
    const parentExecId = node.parentReasonerId
      ? `exec-${node.parentReasonerId}`
      : undefined;

    return {
      execution_id: `exec-${node.reasonerId}`,
      parent_execution_id: parentExecId,
      agent_node_id: node.agentNodeId,
      reasoner_id: node.reasonerId,
      status: nodeStatus,
      started_at: new Date(startMs).toISOString(),
      completed_at: nodeIsTerminal ? new Date(endMs).toISOString() : undefined,
      duration_ms: nodeIsTerminal ? nodeDuration : undefined,
      workflow_depth: node.depth,
    };
  });
}

/** Generate full WorkflowDAGLightweightResponse wrapping a timeline. */
export function generateDAGResponse(
  runId: string,
  topology: DemoDAGTopology,
  status: string,
  agentNodes: DemoAgentNodeConfig[],
  displayName?: string,
): WorkflowDAGLightweightResponse {
  const timeline = generateDAGTimeline(topology, status, agentNodes);
  const maxDepth = Math.max(...timeline.map((n) => n.workflow_depth), 0);
  const uniqueAgentNodeIds = [...new Set(timeline.map((n) => n.agent_node_id))];

  return {
    root_workflow_id: runId,
    workflow_status: status,
    workflow_name: displayName ?? `Demo Run ${runId.slice(0, 8)}`,
    session_id: generateId(),
    actor_id: 'demo-user',
    total_nodes: timeline.length,
    max_depth: maxDepth,
    timeline,
    mode: 'lightweight',
    unique_agent_node_ids: uniqueAgentNodeIds,
  };
}

// ─── Log Line Generator ─────────────────────────────────────────────────────

/** Placeholder values for {placeholder} substitution in log templates. */
const PLACEHOLDER_VALUES: Record<string, string[]> = {
  // Generic
  count: ['1', '2', '3', '5', '8', '13'],
  score: ['0.91', '0.78', '0.95', '0.63', '0.88', '0.72', '0.45'],
  confidence: ['0.82', '0.91', '0.67', '0.73', '0.96', '0.58'],
  percentage: ['12', '34', '56', '73', '89', '95'],

  // Healthcare
  age: ['34', '52', '67', '78', '45', '61', '23'],
  complaint: ['chest pain', 'shortness of breath', 'abdominal pain', 'headache', 'fatigue', 'dizziness'],
  urgencyLevel: ['HIGH', 'MEDIUM', 'LOW', 'CRITICAL'],
  riskFactor: ['cardiac history', 'diabetes', 'hypertension', 'family history', 'smoking'],
  medication: ['warfarin', 'metformin', 'lisinopril', 'aspirin', 'atorvastatin'],
  specialty: ['cardiology', 'pulmonology', 'neurology', 'gastroenterology', 'endocrinology'],
  doctorName: ['Dr. Chen', 'Dr. Patel', 'Dr. Rodriguez', 'Dr. Kim', 'Dr. Thompson'],
  priority: ['URGENT', 'HIGH', 'ROUTINE', 'STAT'],
  query: ['acute coronary syndrome indicators', 'pulmonary embolism markers', 'GI obstruction signs', 'stroke indicators'],
  indicatorCount: ['2', '3', '5', '7'],
  accessor: ['differential-dx', 'evidence-gatherer', 'triage-classifier'],
  justification: ['active-triage', 'clinical-review', 'emergency-protocol'],
  recordId: ['EHR-10472', 'EHR-20891', 'EHR-30156', 'EHR-40723'],

  // Finance
  txId: ['8827441', '9912034', '7745621', '3301987', '5567823'],
  amount: ['47,200', '12,500', '98,750', '3,200', '156,000', '8,900'],
  txType: ['wire transfer', 'ACH payment', 'card transaction', 'cross-border transfer'],
  patternType: ['unusual destination country', 'high-value first-time', 'rapid succession', 'round-amount pattern'],
  txCount: ['3', '5', '7', '12'],
  minutes: ['15', '30', '5', '60'],
  riskLevel: ['ELEVATED', 'HIGH', 'LOW', 'MODERATE', 'CRITICAL'],
  sigma: ['1.8', '2.3', '3.1', '1.2', '2.7'],
  classifierType: ['Behavioral', 'Network', 'Device', 'Geolocation'],
  listName: ['OFAC/EU/UN', 'OFAC', 'EU consolidated', 'UN Security Council'],
  matchResult: ['no match', 'potential match — manual review required', 'cleared'],
  typology: ['layering pattern', 'structuring', 'round-tripping', 'trade-based laundering'],
  thresholdResult: ['below threshold', 'above threshold — flagged'],
  threshold: ['0.65', '0.70', '0.75', '0.80'],
  comparison: ['>', '<', '≥'],
  destination: ['manual review', 'auto-approval', 'escalation queue'],
  reason: ['elevated risk + velocity flags', 'sanctions near-match', 'unusual pattern + high value'],

  // SaaS
  latencyMs: ['2100', '3500', '1800', '5200', '890'],
  sourceCount: ['3', '5', '7'],
  endpoint: ['recommendations', 'search', 'content', 'billing', 'auth'],
  queueDepth: ['847', '1203', '456', '2100'],
  multiplier: ['12', '8', '15', '5', '20'],
  tenantName: ['acme-corp', 'globex-inc', 'initech', 'umbrella-co', 'stark-industries'],
  plan: ['enterprise', 'pro', 'team', 'starter'],
  component: ['recommendation model', 'search index', 'content cache', 'auth service'],
  version: ['2.14.3', '3.0.1', '1.9.7', '4.2.0'],
  cacheType: ['recommendation', 'search', 'session', 'content'],
  etaSeconds: ['8', '12', '3', '15'],
  service: ['recommendation-engine', 'content-pipeline', 'api-gateway', 'search-service'],
  fromCount: ['3', '2', '4', '1'],
  toCount: ['8', '6', '10', '5'],
  newVersion: ['2.14.3', '3.0.1'],
  oldVersion: ['2.14.2', '3.0.0'],
  mttrSeconds: ['43', '67', '120', '28', '95'],
  tenantCount: ['3', '7', '12', '1'],
  impact: ['0', '1,200', '0', '4,500'],
  delta: ['0.02', '0.05', '0.01', '0.08'],
};

function fillPlaceholders(template: string): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const options = PLACEHOLDER_VALUES[key];
    return options && options.length > 0 ? pickRandom(options) : key;
  });
}

/**
 * Generate a single log line from the scenario's log templates.
 * Fills {placeholders} with realistic domain-specific values.
 */
export function generateLogLine(
  templates: DemoLogTemplate[],
  _agentNodes: DemoAgentNodeConfig[],
): DemoLogEntry {
  if (templates.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      agentNode: 'demo-agent',
      reasoner: 'demo-reasoner',
      message: 'Demo log entry',
    };
  }

  const template = pickRandom(templates);

  return {
    timestamp: new Date().toISOString(),
    level: template.level,
    agentNode: template.agentNode,
    reasoner: template.reasoner,
    message: fillPlaceholders(template.messageTemplate),
  };
}
