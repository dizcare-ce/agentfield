/**
 * Demo mode type system for AgentField's web UI.
 *
 * This module defines all types used by the demo layer: verticals, scenarios,
 * DAG topologies, access policies, log templates, and the runtime demo state
 * managed by DemoContext. It re-exports relevant upstream types so consumers
 * only need to import from one place.
 */

// ---------------------------------------------------------------------------
// Re-exports from upstream type modules
// ---------------------------------------------------------------------------

export type { CanonicalStatus } from '../../utils/status';
export type { WorkflowSummary, WorkflowTimelineNode, WorkflowDAGLightweightNode } from '../../types/workflows';
export type { ExecutionSummary, WorkflowExecution } from '../../types/executions';
export type { AgentNode, ReasonerDefinition, HealthStatus, LifecycleStatus } from '../../types/agentfield';

// ---------------------------------------------------------------------------
// Vertical identifiers
// ---------------------------------------------------------------------------

/** Supported demo verticals. Each maps to a full DemoScenario. */
export type DemoVertical = 'healthcare' | 'finance' | 'saas';

// ---------------------------------------------------------------------------
// Agent node & reasoner configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a single reasoner within a demo agent node.
 * Maps to ReasonerDefinition on the wire but uses friendlier camelCase
 * and typed schemas.
 */
export interface DemoReasonerConfig {
  /** Unique reasoner identifier within the agent node (e.g. "triage", "score_risk"). */
  id: string;
  /** Human-readable name shown in the UI. */
  displayName: string;
  /** Optional prose description of what this reasoner does. */
  description?: string;
  /** JSON Schema describing the reasoner's expected input. */
  inputSchema?: Record<string, unknown>;
  /** JSON Schema describing the reasoner's expected output. */
  outputSchema?: Record<string, unknown>;
}

/**
 * Full configuration for one agent node in a demo vertical.
 * Used to generate synthetic AgentNode objects for the mock API layer.
 */
export interface DemoAgentNodeConfig {
  /** Agent node identifier (e.g. "clinical-intake-agent"). */
  id: string;
  /** Human-readable name shown in the UI. */
  displayName: string;
  /** All reasoners registered on this node. */
  reasoners: DemoReasonerConfig[];
  /** Semver string for the mock agent (defaults to "1.0.0" if omitted). */
  version?: string;
  /** Deployment model for this node. */
  deploymentType?: 'long_running' | 'serverless';
}

// ---------------------------------------------------------------------------
// DAG topology
// ---------------------------------------------------------------------------

/**
 * Describes the directed acyclic graph of reasoner invocations for a run.
 *
 * Each edge is a 3-tuple: [parentReasonerId | null, childReasonerId, agentNodeId].
 * A null parent means the child is the root (entry-point) node.
 *
 * @example
 * edges: [
 *   [null,      'triage',      'clinical-intake-agent'],
 *   ['triage',  'score_risk',  'risk-scoring-agent'],
 *   ['triage',  'enrich',      'enrichment-agent'],
 * ]
 */
export interface DemoDAGTopology {
  /**
   * Ordered list of edges. Each tuple: [parentReasonerId | null, childReasonerId, agentNodeId].
   * null parent denotes the root node.
   */
  edges: Array<[string | null, string, string]>;
  /** Expected total number of execution nodes generated from this topology. */
  expectedNodeCount: number;
}

// ---------------------------------------------------------------------------
// Run templates
// ---------------------------------------------------------------------------

/**
 * Template used to generate a WorkflowSummary (and its child executions)
 * for the mock data layer.
 */
export interface DemoRunTemplate {
  /** Human-readable name for the run (becomes WorkflowSummary.display_name). */
  displayName: string;
  /** Reasoner ID that starts the run (becomes WorkflowSummary.root_reasoner). */
  rootReasoner: string;
  /** Agent node that owns the root reasoner. */
  agentNodeId: string;
  /** Topology for generating WorkflowTimelineNode objects. */
  topology: DemoDAGTopology;
  /** IDs of all agent nodes that participate in this run. */
  participatingAgentNodes: string[];
  /**
   * Expected wall-clock duration range in milliseconds [min, max].
   * The mock generator picks a random value within this range.
   */
  durationRange: [number, number];
}

// ---------------------------------------------------------------------------
// Access policies
// ---------------------------------------------------------------------------

/**
 * A single access rule within a DemoAccessPolicy.
 * Rules are evaluated in order; the first matching rule's effect applies.
 */
export interface DemoAccessRule {
  /** Unique rule identifier. */
  id: string;
  /** Whether this rule permits or denies the matched action. */
  effect: 'allow' | 'deny';
  /** Optional tag applied to the source agent node. */
  sourceTag?: string;
  /** Target reasoner ID this rule applies to. */
  targetReasoner?: string;
  /** Target agent node ID this rule applies to. */
  targetAgentNode?: string;
  /** Optional CEL / freeform condition expression. */
  condition?: string;
  /** Human-readable explanation of what this rule governs. */
  description: string;
}

/**
 * A complete access policy for a demo vertical.
 * Rendered in the Policies / Boundaries section of the UI.
 */
export interface DemoAccessPolicy {
  /** Unique policy identifier. */
  id: string;
  /** Policy display name. */
  name: string;
  /** Prose description of what this policy enforces. */
  description: string;
  /** Ordered list of access rules. */
  rules: DemoAccessRule[];
  /** Whether the policy is currently active. */
  enabled: boolean;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Streaming logs
// ---------------------------------------------------------------------------

/** A single structured log line emitted during a demo run. */
export interface DemoLogEntry {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Log severity level. */
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
  /** Agent node ID that produced this log line. */
  agentNode: string;
  /** Reasoner ID that produced this log line. */
  reasoner: string;
  /** The rendered log message. */
  message: string;
}

/**
 * A template for generating realistic log lines specific to a vertical.
 * `messageTemplate` may contain `{placeholder}` tokens that the generator
 * replaces with context-appropriate values at runtime.
 *
 * @example
 * { messageTemplate: "Patient {patientId} triage score computed: {score}" }
 */
export interface DemoLogTemplate {
  /** Agent node ID associated with this log template. */
  agentNode: string;
  /** Reasoner ID associated with this log template. */
  reasoner: string;
  /** Severity level for generated log entries. */
  level: DemoLogEntry['level'];
  /**
   * Message template string. Placeholders are wrapped in curly braces and
   * substituted by the log generator (e.g. `{patientId}`, `{amount}`).
   */
  messageTemplate: string;
}

// ---------------------------------------------------------------------------
// Full scenario
// ---------------------------------------------------------------------------

/**
 * A complete demo scenario for one vertical.
 * Contains all data needed to boot the demo: agent nodes, run templates,
 * access policies, and log templates.
 */
export interface DemoScenario {
  /** Which vertical this scenario belongs to. */
  vertical: DemoVertical;
  /** Short human-readable label (e.g. "Healthcare"). */
  label: string;
  /** Longer description shown in the vertical picker. */
  description: string;
  /** All agent nodes that exist in this vertical. */
  agentNodes: DemoAgentNodeConfig[];
  /**
   * The "hero" run — a carefully crafted, fully-successful run used for the
   * guided tour and onboarding story.
   */
  heroRun: DemoRunTemplate;
  /**
   * The "monster" run — a large, complex, multi-agent run with failures,
   * used to stress-test the DAG visualizer and timeline views.
   */
  monsterRun: DemoRunTemplate;
  /**
   * Pool of run templates used to generate the 100 varied historical runs
   * shown in the Runs list. The generator randomly samples from this pool.
   */
  runTemplates: DemoRunTemplate[];
  /** Access policies pre-loaded for this vertical. */
  accessPolicies: DemoAccessPolicy[];
  /** Log templates used to generate streaming logs during live runs. */
  logTemplates: DemoLogTemplate[];
}

// ---------------------------------------------------------------------------
// Vertical metadata (picker UI)
// ---------------------------------------------------------------------------

/**
 * Lightweight metadata for a vertical, used to render the vertical picker
 * without loading the full scenario.
 */
export interface DemoVerticalMeta {
  /** Vertical identifier. */
  id: DemoVertical;
  /** Display label (e.g. "Healthcare"). */
  label: string;
  /** Short description shown beneath the label in the picker. */
  description: string;
  /**
   * Icon name from the `lucide-react` package (e.g. "HeartPulse", "Landmark").
   * Consumers import the icon dynamically: `import { [icon] } from 'lucide-react'`.
   */
  icon: string;
}

// ---------------------------------------------------------------------------
// Demo state & actions
// ---------------------------------------------------------------------------

/**
 * Runtime state for the demo mode, managed by DemoContext.
 *
 * `act` divides the guided tour into four phases:
 *  - 0: pre-activation (vertical not yet chosen)
 *  - 1: observability — Runs list + DAG view
 *  - 2: governance  — Policies / access control
 *  - 3: provenance  — Audit trail / VC chain
 */
export interface DemoState {
  /** Whether demo mode is currently active. */
  active: boolean;
  /** Currently selected vertical, or null if none chosen. */
  vertical: DemoVertical | null;
  /** Current act in the guided tour narrative (0–3). */
  act: 0 | 1 | 2 | 3;
  /** Fine-grained story beat within the current act (0-indexed). */
  storyBeat: number;
  /** Set of route paths the user has navigated to during this session. */
  visitedPages: Set<string>;
  /** Run ID of the currently in-progress live demo run. */
  inProgressRunId: string;
}

/**
 * Actions exposed by DemoContext for mutating DemoState.
 * All actions are synchronous from the caller's perspective; async side-effects
 * (e.g. seeding mock data) are handled internally by the context.
 */
export interface DemoActions {
  /** Activate demo mode and load the scenario for the given vertical. */
  activateDemo: (vertical: DemoVertical) => void;
  /** Deactivate demo mode and clear all demo state. */
  deactivateDemo: () => void;
  /** Advance to the next story beat within the current act. */
  advanceBeat: () => void;
  /** Jump to a specific act in the guided tour. */
  setAct: (act: DemoState['act']) => void;
  /** Record that the user has visited a given route path. */
  markPageVisited: (path: string) => void;
  /** Switch to a different vertical without fully deactivating demo mode. */
  switchVertical: (vertical: DemoVertical) => void;
  /** Reset the guided tour back to act 1, beat 0 without changing the vertical. */
  restartTour: () => void;
}
