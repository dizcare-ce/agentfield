// ─── Timing Constants ─────────────────────────────────────────────────────────
export const DEMO_TIMING = {
  /** Interval between streaming log lines (ms) */
  LOG_INTERVAL_MIN_MS: 300,
  LOG_INTERVAL_MAX_MS: 500,
  /** Interval between new DAG nodes appearing (ms) */
  DAG_NODE_INTERVAL_MS: 2500,
  /** Time before in-progress run "completes" (ms) */
  RUN_COMPLETE_DELAY_MS: 60_000,
  /** Delay before a new in-progress run starts (ms) */
  NEW_RUN_DELAY_MS: 30_000,
  /** Max log lines to keep in buffer */
  MAX_LOG_BUFFER: 200,
  /** Status transition delay for DAG nodes: pending -> running (ms) */
  STATUS_TRANSITION_MS: 800,
} as const;

// ─── Storyline Beats ──────────────────────────────────────────────────────────
export interface StorylineBeat {
  id: string;
  /** Card text — use {vertical} for vertical-specific label, {nodeCount} for hero run size */
  text: string;
  /** Route to navigate to when user clicks the action */
  targetRoute: string;
  /** Label for the action button */
  actionLabel: string;
  /** Whether this beat can be dismissed without action */
  dismissable: boolean;
}

export const STORYLINE_BEATS: StorylineBeat[] = [
  {
    id: 'hero-run-intro',
    text: 'A {vertical} pipeline with {nodeCount} agents just completed in 12.3s. See what happened.',
    targetRoute: '/runs/{heroRunId}',
    actionLabel: 'View Run',
    dismissable: true,
  },
  {
    id: 'dag-explore',
    text: 'This is the execution graph — {nodeCount} agents across {agentNodeCount} nodes worked together. Click any node to inspect it.',
    targetRoute: '/runs/{heroRunId}',
    actionLabel: '',  // No button — they click a DAG node
    dismissable: true,
  },
  {
    id: 'trace-view',
    text: 'Switch to the Trace tab to see every step in execution order — with live logs streaming.',
    targetRoute: '/runs/{heroRunId}',
    actionLabel: 'Open Trace',
    dismissable: true,
  },
  {
    id: 'compare-runs',
    text: 'A second run failed at a policy gate. Compare them side-by-side to see exactly where they diverged.',
    targetRoute: '/runs/compare?a={heroRunId}&b={failedRunId}',
    actionLabel: 'Compare Runs',
    dismissable: true,
  },
  {
    id: 'policies',
    text: 'The divergence happened because of an access policy. See what policies control which agents can call which reasoners.',
    targetRoute: '/access',
    actionLabel: 'View Policies',
    dismissable: true,
  },
  {
    id: 'policy-detail',
    text: 'Tags control authorization between agents. This is how you build guardrails into your AI backend — no code changes needed.',
    targetRoute: '/access',
    actionLabel: '',  // They interact with the policies
    dismissable: true,
  },
  {
    id: 'provenance',
    text: 'Every execution is cryptographically signed with W3C Verifiable Credentials. Verify the full audit trail.',
    targetRoute: '/verify',
    actionLabel: 'Verify Provenance',
    dismissable: true,
  },
  {
    id: 'transition',
    text: "That's the highlights. The demo is yours — {runCount}+ runs, {agentNodeCount} agent nodes, live data streaming. Explore freely.",
    targetRoute: '',
    actionLabel: 'Explore',
    dismissable: true,
  },
];

// ─── Hotspot Items ────────────────────────────────────────────────────────────
export interface HotspotItem {
  id: string;
  /** CSS selector or route path to match */
  route: string;
  /** One-line hint shown on hover */
  hint: string;
}

export const HOTSPOT_ITEMS: HotspotItem[] = [
  { id: 'dashboard', route: '/dashboard', hint: 'Real-time health across all agent nodes' },
  { id: 'agents', route: '/agents', hint: 'See {agentNodeCount} agents and their reasoners' },
  { id: 'runs', route: '/runs', hint: '{runCount}+ runs — filter, search, compare' },
  { id: 'playground', route: '/playground', hint: 'Fire any reasoner directly — instant feedback loop' },
  { id: 'access', route: '/access', hint: 'Tag-based authorization policies' },
  { id: 'verify', route: '/verify', hint: 'Cryptographic provenance verification' },
  { id: 'settings', route: '/settings', hint: 'Observability webhooks and configuration' },
];

// ─── Vertical Metadata ────────────────────────────────────────────────────────

export const VERTICALS = [
  {
    id: 'healthcare' as const,
    label: 'Healthcare & Life Sciences',
    description: 'Clinical pipelines that reason over patient data',
    icon: 'Heart',  // lucide icon name
  },
  {
    id: 'finance' as const,
    label: 'Financial Services',
    description: 'Risk & compliance that monitor, score, and audit in real-time',
    icon: 'TrendingUp',
  },
  {
    id: 'saas' as const,
    label: 'SaaS Platform',
    description: 'Backend intelligence that powers product features at scale',
    icon: 'Cpu',
  },
] as const;

// ─── localStorage Keys ────────────────────────────────────────────────────────
export const DEMO_STORAGE_KEYS = {
  ACTIVE: 'af-demo-active',
  VERTICAL: 'af-demo-vertical',
  ACT: 'af-demo-act',
  STORY_BEAT: 'af-demo-storyline-beat',
  VISITED_PAGES: 'af-demo-visited',
  EXIT_DISMISSED: 'af-demo-exit-dismissed',
  AUTO_DISMISSED: 'af-demo-auto-dismissed',
} as const;
