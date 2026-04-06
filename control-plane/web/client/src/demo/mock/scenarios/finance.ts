import type {
  DemoScenario,
  DemoAgentNodeConfig,
  DemoRunTemplate,
  DemoDAGTopology,
  DemoAccessPolicy,
  DemoLogTemplate,
} from '../types';

const agentNodes: DemoAgentNodeConfig[] = [
  {
    id: 'transaction-monitor',
    displayName: 'Transaction Monitor',
    reasoners: [
      { id: 'tx-ingester', displayName: 'Transaction Ingester', description: 'Normalizes and validates incoming transaction messages.' },
      { id: 'pattern-detector', displayName: 'Pattern Detector', description: 'Identifies known fraud patterns and behavioral anomalies.' },
      { id: 'velocity-checker', displayName: 'Velocity Checker', description: 'Monitors transaction frequency and volume across various time windows.' },
    ],
  },
  {
    id: 'risk-engine',
    displayName: 'Risk Engine',
    reasoners: [
      { id: 'risk-scorer', displayName: 'Risk Scorer', description: 'Calculates a composite risk score based on multiple risk dimensions.' },
      { id: 'fraud-classifier', displayName: 'Fraud Classifier', description: 'Uses ML models to classify transactions into fraud risk categories.' },
      { id: 'sanctions-screener', displayName: 'Sanctions Screener', description: 'Checks parties against global sanctions and watchlists.' },
      { id: 'aml-analyzer', displayName: 'AML Analyzer', description: 'Detects money laundering typologies and suspicious activity.' },
    ],
  },
  {
    id: 'decision-gateway',
    displayName: 'Decision Gateway',
    reasoners: [
      { id: 'threshold-evaluator', displayName: 'Threshold Evaluator', description: 'Evaluates risk scores against configurable business thresholds.' },
      { id: 'escalation-router', displayName: 'Escalation Router', description: 'Routes high-risk cases to manual compliance review.' },
      { id: 'auto-approver', displayName: 'Auto Approver', description: 'Automatically approves transactions meeting low-risk criteria.' },
    ],
  },
  {
    id: 'compliance-ledger',
    displayName: 'Compliance Ledger',
    reasoners: [
      { id: 'vc-signer', displayName: 'VC Signer', description: 'Generates Verifiable Credentials for audit trails.' },
      { id: 'regulatory-reporter', displayName: 'Regulatory Reporter', description: 'Prepares and submits SARs and other regulatory filings.' },
      { id: 'audit-archiver', displayName: 'Audit Archiver', description: 'Securely archives execution data for long-term retention.' },
    ],
  },
];

// --- Hero Run Topology ---
const heroEdges: DemoDAGTopology['edges'] = [];

// Entry point
heroEdges.push([null, 'tx-ingester', 'transaction-monitor']);
heroEdges.push(['tx-ingester', 'pattern-detector', 'transaction-monitor']);
heroEdges.push(['tx-ingester', 'velocity-checker', 'transaction-monitor']);
heroEdges.push(['tx-ingester', 'compliance-audit-log', 'compliance-ledger']);

// Initial processing
heroEdges.push(['velocity-checker', 'ip-reputation-check', 'transaction-monitor']);
heroEdges.push(['ip-reputation-check', 'risk-scorer', 'risk-engine']);
heroEdges.push(['pattern-detector', 'risk-scorer', 'risk-engine']);
heroEdges.push(['pattern-detector', 'ip-reputation-check', 'transaction-monitor']);
heroEdges.push(['velocity-checker', 'risk-scorer', 'risk-engine']);

// Parallel risk dimensions
const fraudClassifiers = [
  'fraud-classifier-behavioral',
  'fraud-classifier-network',
  'fraud-classifier-device',
  'fraud-classifier-geolocation'
];

fraudClassifiers.forEach((fc) => {
  const suffix = fc.split('-').pop();
  heroEdges.push(['risk-scorer', fc, 'risk-engine']);
  heroEdges.push([fc, `feature-extractor-${suffix}`, 'risk-engine']);
  heroEdges.push([`feature-extractor-${suffix}`, `confidence-aggregator-${suffix}`, 'risk-engine']);
  heroEdges.push([`confidence-aggregator-${suffix}`, 'threshold-evaluator', 'decision-gateway']);
});

// Sanctions and AML
heroEdges.push(['risk-scorer', 'sanctions-screener', 'risk-engine']);
heroEdges.push(['sanctions-screener', 'watchlist-resolver', 'risk-engine']);
heroEdges.push(['watchlist-resolver', 'match-confidence-scorer', 'risk-engine']);
heroEdges.push(['match-confidence-scorer', 'threshold-evaluator', 'decision-gateway']);
heroEdges.push(['sanctions-screener', 'confidence-aggregator-sanctions', 'risk-engine']);
heroEdges.push(['confidence-aggregator-sanctions', 'threshold-evaluator', 'decision-gateway']);

heroEdges.push(['risk-scorer', 'aml-analyzer', 'risk-engine']);
heroEdges.push(['aml-analyzer', 'typology-matcher', 'risk-engine']);
heroEdges.push(['typology-matcher', 'alert-generator', 'risk-engine']);
heroEdges.push(['alert-generator', 'threshold-evaluator', 'decision-gateway']);
heroEdges.push(['aml-analyzer', 'confidence-aggregator-aml', 'risk-engine']);
heroEdges.push(['confidence-aggregator-aml', 'threshold-evaluator', 'decision-gateway']);

// Direct link for composite score
heroEdges.push(['risk-scorer', 'threshold-evaluator', 'decision-gateway']);

// Decision Gateway
heroEdges.push(['threshold-evaluator', 'auto-approver', 'decision-gateway']);
heroEdges.push(['auto-approver', 'settlement-initiator', 'decision-gateway']);

heroEdges.push(['threshold-evaluator', 'escalation-router', 'decision-gateway']);
heroEdges.push(['escalation-router', 'case-creator', 'decision-gateway']);
heroEdges.push(['case-creator', 'analyst-notifier', 'decision-gateway']);

// Compliance Ledger
heroEdges.push(['settlement-initiator', 'vc-signer', 'compliance-ledger']);
heroEdges.push(['analyst-notifier', 'regulatory-reporter', 'compliance-ledger']);
heroEdges.push(['regulatory-reporter', 'vc-signer', 'compliance-ledger']);
heroEdges.push(['vc-signer', 'audit-archiver', 'compliance-ledger']);
heroEdges.push(['auto-approver', 'vc-signer', 'compliance-ledger']);
heroEdges.push(['compliance-audit-log', 'audit-archiver', 'compliance-ledger']);
heroEdges.push(['audit-archiver', 'backup-sync', 'compliance-ledger']);
heroEdges.push(['audit-archiver', 'notification-service', 'compliance-ledger']);

const countNodes = (edges: DemoDAGTopology['edges']): number => {
  const nodes = new Set<string>();
  edges.forEach(([, child]) => nodes.add(child));
  return nodes.size;
};

const heroRun: DemoRunTemplate = {
  displayName: 'Real-Time Transaction Risk Assessment',
  rootReasoner: 'tx-ingester',
  agentNodeId: 'transaction-monitor',
  participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway', 'compliance-ledger'],
  topology: {
    edges: heroEdges,
    expectedNodeCount: countNodes(heroEdges),
  },
  durationRange: [8000, 14000],
};

// --- Monster Run Topology ---
const monsterEdges: DemoDAGTopology['edges'] = [];
monsterEdges.push([null, 'batch-tx-dispatcher', 'transaction-monitor']);
for (let i = 0; i < 30; i++) {
  const s = `-tx-${i}`;
  monsterEdges.push(['batch-tx-dispatcher', `tx-ingester${s}`, 'transaction-monitor']);
  monsterEdges.push([`tx-ingester${s}`, `pattern-detector${s}`, 'transaction-monitor']);
  monsterEdges.push([`pattern-detector${s}`, `risk-scorer${s}`, 'risk-engine']);
  monsterEdges.push([`risk-scorer${s}`, `fraud-classifier${s}`, 'risk-engine']);
  monsterEdges.push([`risk-scorer${s}`, `sanctions-screener${s}`, 'risk-engine']);
  monsterEdges.push([`fraud-classifier${s}`, `threshold-evaluator${s}`, 'decision-gateway']);
  monsterEdges.push([`sanctions-screener${s}`, `threshold-evaluator${s}`, 'decision-gateway']);
  monsterEdges.push([`threshold-evaluator${s}`, `vc-signer${s}`, 'compliance-ledger']);
  monsterEdges.push([`vc-signer${s}`, `audit-archiver${s}`, 'compliance-ledger']);
}

const monsterRun: DemoRunTemplate = {
  displayName: 'Batch Transaction Compliance Sweep',
  rootReasoner: 'batch-tx-dispatcher',
  agentNodeId: 'transaction-monitor',
  participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway', 'compliance-ledger'],
  topology: {
    edges: monsterEdges,
    expectedNodeCount: countNodes(monsterEdges),
  },
  durationRange: [35000, 50000],
};

if (heroEdges.length < 45 || heroEdges.length > 55) {
  throw new Error(`Finance hero topology edge count (${heroEdges.length}) should be ~50.`);
}

if (monsterRun.topology.expectedNodeCount < 240) {
  throw new Error(`Finance monster topology node count (${monsterRun.topology.expectedNodeCount}) should be 241+.`);
}

// --- Varied Run Templates ---
const runTemplates: DemoRunTemplate[] = [
  {
    displayName: 'Simple Transaction Check',
    rootReasoner: 'tx-ingester',
    agentNodeId: 'transaction-monitor',
    participatingAgentNodes: ['transaction-monitor'],
    topology: {
      edges: [
        [null, 'tx-ingester', 'transaction-monitor'],
        ['tx-ingester', 'pattern-detector', 'transaction-monitor'],
        ['pattern-detector', 'velocity-checker', 'transaction-monitor'],
      ],
      expectedNodeCount: 3,
    },
    durationRange: [1500, 3000],
  },
  {
    displayName: 'Fraud Score',
    rootReasoner: 'risk-scorer',
    agentNodeId: 'risk-engine',
    participatingAgentNodes: ['risk-engine'],
    topology: {
      edges: [
        [null, 'risk-scorer', 'risk-engine'],
        ['risk-scorer', 'fraud-classifier', 'risk-engine'],
        ['risk-scorer', 'sanctions-screener', 'risk-engine'],
      ],
      expectedNodeCount: 3,
    },
    durationRange: [2000, 4000],
  },
  {
    displayName: 'Quick Approval',
    rootReasoner: 'tx-ingester',
    agentNodeId: 'transaction-monitor',
    participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway'],
    topology: {
      edges: [
        [null, 'tx-ingester', 'transaction-monitor'],
        ['tx-ingester', 'pattern-detector', 'transaction-monitor'],
        ['pattern-detector', 'risk-scorer', 'risk-engine'],
        ['risk-scorer', 'threshold-evaluator', 'decision-gateway'],
        ['threshold-evaluator', 'auto-approver', 'decision-gateway'],
      ],
      expectedNodeCount: 5,
    },
    durationRange: [3000, 5000],
  },
  {
    displayName: 'Full Risk Assessment',
    rootReasoner: 'tx-ingester',
    agentNodeId: 'transaction-monitor',
    participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway', 'compliance-ledger'],
    topology: {
      edges: [
        [null, 'tx-ingester', 'transaction-monitor'],
        ['tx-ingester', 'pattern-detector', 'transaction-monitor'],
        ['tx-ingester', 'velocity-checker', 'transaction-monitor'],
        ['pattern-detector', 'risk-scorer', 'risk-engine'],
        ['risk-scorer', 'fraud-classifier-1', 'risk-engine'],
        ['risk-scorer', 'fraud-classifier-2', 'risk-engine'],
        ['risk-scorer', 'fraud-classifier-3', 'risk-engine'],
        ['fraud-classifier-1', 'threshold-evaluator', 'decision-gateway'],
        ['threshold-evaluator', 'auto-approver', 'decision-gateway'],
        ['auto-approver', 'vc-signer', 'compliance-ledger'],
        ['vc-signer', 'audit-archiver', 'compliance-ledger'],
      ],
      expectedNodeCount: 12,
    },
    durationRange: [7000, 12000],
  },
  {
    displayName: 'Escalated Transaction',
    rootReasoner: 'tx-ingester',
    agentNodeId: 'transaction-monitor',
    participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway', 'compliance-ledger'],
    topology: {
      edges: [
        [null, 'tx-ingester', 'transaction-monitor'],
        ['tx-ingester', 'pattern-detector', 'transaction-monitor'],
        ['pattern-detector', 'risk-scorer', 'risk-engine'],
        ['risk-scorer', 'fraud-classifier', 'risk-engine'],
        ['risk-scorer', 'sanctions-screener', 'risk-engine'],
        ['fraud-classifier', 'threshold-evaluator', 'decision-gateway'],
        ['threshold-evaluator', 'escalation-router', 'decision-gateway'],
        ['escalation-router', 'regulatory-reporter', 'compliance-ledger'],
        ['regulatory-reporter', 'vc-signer', 'compliance-ledger'],
        ['vc-signer', 'audit-archiver', 'compliance-ledger'],
      ],
      expectedNodeCount: 10,
    },
    durationRange: [6000, 10000],
  },
  {
    displayName: 'AML Deep Dive',
    rootReasoner: 'tx-ingester',
    agentNodeId: 'transaction-monitor',
    participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway', 'compliance-ledger'],
    topology: {
      edges: [
        [null, 'tx-ingester', 'transaction-monitor'],
        ['tx-ingester', 'aml-analyzer', 'risk-engine'],
        ['aml-analyzer', 'sanctions-screener', 'risk-engine'],
        ['sanctions-screener', 'fraud-classifier-1', 'risk-engine'],
        ['sanctions-screener', 'fraud-classifier-2', 'risk-engine'],
        ['fraud-classifier-1', 'threshold-evaluator', 'decision-gateway'],
        ['threshold-evaluator', 'escalation-router', 'decision-gateway'],
        ['escalation-router', 'regulatory-reporter', 'compliance-ledger'],
      ],
      expectedNodeCount: 8,
    },
    durationRange: [5000, 9000],
  },
  {
    displayName: 'Compliance Audit Run',
    rootReasoner: 'vc-signer',
    agentNodeId: 'compliance-ledger',
    participatingAgentNodes: ['compliance-ledger', 'risk-engine'],
    topology: {
      edges: [
        [null, 'vc-signer', 'compliance-ledger'],
        ['vc-signer', 'audit-archiver', 'compliance-ledger'],
        ['audit-archiver', 'regulatory-reporter', 'compliance-ledger'],
        ['regulatory-reporter', 'sanctions-screener', 'risk-engine'],
        ['sanctions-screener', 'aml-analyzer', 'risk-engine'],
        ['aml-analyzer', 'audit-archiver', 'compliance-ledger'],
      ],
      expectedNodeCount: 6,
    },
    durationRange: [4000, 7000],
  },
  {
    displayName: 'Multi-Transaction Batch',
    rootReasoner: 'batch-tx-dispatcher',
    agentNodeId: 'transaction-monitor',
    participatingAgentNodes: ['transaction-monitor', 'risk-engine', 'decision-gateway', 'compliance-ledger'],
    topology: {
      edges: [
        [null, 'batch-tx-dispatcher', 'transaction-monitor'],
        ['batch-tx-dispatcher', 'tx-1', 'transaction-monitor'],
        ['batch-tx-dispatcher', 'tx-2', 'transaction-monitor'],
        ['batch-tx-dispatcher', 'tx-3', 'transaction-monitor'],
        // tx 1
        ['tx-1', 'risk-1', 'risk-engine'],
        ['risk-1', 'decide-1', 'decision-gateway'],
        ['decide-1', 'vc-1', 'compliance-ledger'],
        // tx 2
        ['tx-2', 'risk-2', 'risk-engine'],
        ['risk-2', 'decide-2', 'decision-gateway'],
        ['decide-2', 'vc-2', 'compliance-ledger'],
        // tx 3
        ['tx-3', 'risk-3', 'risk-engine'],
        ['risk-3', 'decide-3', 'decision-gateway'],
        ['decide-3', 'vc-3', 'compliance-ledger'],
        // Sync
        ['vc-1', 'audit-all', 'compliance-ledger'],
        ['vc-2', 'audit-all', 'compliance-ledger'],
        ['vc-3', 'audit-all', 'compliance-ledger'],
      ],
      expectedNodeCount: 18,
    },
    durationRange: [12000, 20000],
  },
];

// --- Access Policies ---
const accessPolicies: DemoAccessPolicy[] = [
  {
    id: 'pii-boundary',
    name: 'PII Boundary',
    description: 'Enforces tokenization of sensitive financial data across service boundaries.',
    enabled: true,
    createdAt: new Date().toISOString(),
    rules: [
      {
        id: 'tokenization-mandatory',
        effect: 'deny',
        condition: 'request.body.contains("card_number") && target.node != "transaction-monitor"',
        description: 'Prevent raw card numbers from leaving the transaction-monitor agent.',
      },
    ],
  },
  {
    id: 'approval-authority',
    name: 'Approval Authority',
    description: 'Restricts transaction approval capabilities to authorized decision gateway reasoners.',
    enabled: true,
    createdAt: new Date().toISOString(),
    rules: [
      {
        id: 'allow-gateway-approval',
        effect: 'allow',
        targetAgentNode: 'decision-gateway',
        description: 'Only decision-gateway reasoners can issue approve/decline effects.',
      },
      {
        id: 'deny-other-approval',
        effect: 'deny',
        targetReasoner: 'auto-approver',
        description: 'Prevent non-gateway agents from triggering automated approvals.',
      },
    ],
  },
  {
    id: 'sanctions-mandatory',
    name: 'Sanctions Mandatory',
    description: 'Ensures all high-value transactions route through global sanctions screening.',
    enabled: true,
    createdAt: new Date().toISOString(),
    rules: [
      {
        id: 'require-sanctions-high-value',
        effect: 'deny',
        condition: 'request.amount > 10000 && !execution.visited_nodes.contains("sanctions-screener")',
        description: 'All transactions > $10k must route through sanctions-screener.',
      },
    ],
  },
];

// --- Log Templates ---
const logTemplates: DemoLogTemplate[] = [
  { agentNode: 'transaction-monitor', reasoner: 'tx-ingester', level: 'INFO', messageTemplate: 'Processing transaction TX-{txId} — ${amount} {txType}' },
  { agentNode: 'transaction-monitor', reasoner: 'pattern-detector', level: 'INFO', messageTemplate: 'Behavioral pattern match: {patternType} (score: {score})' },
  { agentNode: 'transaction-monitor', reasoner: 'velocity-checker', level: 'DEBUG', messageTemplate: '{txCount} transactions in {minutes} minutes from same originator — velocity flag' },
  { agentNode: 'risk-engine', reasoner: 'risk-scorer', level: 'INFO', messageTemplate: 'Composite risk score: {score} — {riskLevel}' },
  { agentNode: 'risk-engine', reasoner: 'fraud-classifier', level: 'INFO', messageTemplate: '{classifierType} anomaly: {sigma}σ from historical pattern' },
  { agentNode: 'risk-engine', reasoner: 'sanctions-screener', level: 'INFO', messageTemplate: 'Screening against {listName} lists — {matchResult}' },
  { agentNode: 'risk-engine', reasoner: 'aml-analyzer', level: 'INFO', messageTemplate: 'AML typology match: {typology} (confidence: {confidence} — {thresholdResult})' },
  { agentNode: 'decision-gateway', reasoner: 'threshold-evaluator', level: 'INFO', messageTemplate: 'Risk {score} {comparison} auto-approve threshold {threshold} — routing to {destination}' },
  { agentNode: 'decision-gateway', reasoner: 'escalation-router', level: 'WARN', messageTemplate: 'Escalating to compliance team — reason: {reason}' },
  { agentNode: 'compliance-ledger', reasoner: 'vc-signer', level: 'INFO', messageTemplate: 'Signing decision VC — immutable audit record created' },
  { agentNode: 'transaction-monitor', reasoner: 'tx-ingester', level: 'DEBUG', messageTemplate: 'Decoding ISO 8583 message fields: {fields}' },
  { agentNode: 'transaction-monitor', reasoner: 'ip-reputation-check', level: 'INFO', messageTemplate: 'IP {ipAddress} reputation: {reputation} — {isp} ({country})' },
  { agentNode: 'risk-engine', reasoner: 'feature-extractor', level: 'DEBUG', messageTemplate: 'Vectorizing transaction features: {featureCount} dimensions extracted' },
  { agentNode: 'risk-engine', reasoner: 'confidence-aggregator', level: 'INFO', messageTemplate: 'Aggregating {sourceCount} signals — consensus: {consensusScore}' },
  { agentNode: 'risk-engine', reasoner: 'watchlist-resolver', level: 'DEBUG', messageTemplate: 'Fuzzy match hit on {name} — similarity: {similarity}' },
  { agentNode: 'risk-engine', reasoner: 'match-confidence-scorer', level: 'INFO', messageTemplate: 'Watchlist match confidence: {confidence} — {action}' },
  { agentNode: 'risk-engine', reasoner: 'typology-matcher', level: 'DEBUG', messageTemplate: 'Checking against typology: {typologyCode} ({typologyName})' },
  { agentNode: 'risk-engine', reasoner: 'alert-generator', level: 'WARN', messageTemplate: 'Suspicious activity alert generated: {alertId} — Type: {alertType}' },
  { agentNode: 'decision-gateway', reasoner: 'auto-approver', level: 'INFO', messageTemplate: 'Automated approval issued for TX-{txId}' },
  { agentNode: 'decision-gateway', reasoner: 'settlement-initiator', level: 'INFO', messageTemplate: 'Settlement instruction sent to {clearingHouse}' },
  { agentNode: 'decision-gateway', reasoner: 'case-creator', level: 'INFO', messageTemplate: 'Compliance case {caseId} created in Case Management System' },
  { agentNode: 'decision-gateway', reasoner: 'analyst-notifier', level: 'INFO', messageTemplate: 'Notifying on-call analyst group: {groupName}' },
  { agentNode: 'compliance-ledger', reasoner: 'regulatory-reporter', level: 'INFO', messageTemplate: 'SAR draft {reportId} generated for regulatory submission' },
  { agentNode: 'compliance-ledger', reasoner: 'audit-archiver', level: 'INFO', messageTemplate: 'Execution trace archived to cold storage — URI: {storageUri}' },
  { agentNode: 'risk-engine', reasoner: 'fraud-classifier', level: 'ERROR', messageTemplate: 'ML model {modelId} failed to load — falling back to heuristic engine' },
];

export const financeScenario: DemoScenario = {
  vertical: 'finance',
  label: 'Banking & Financial Services',
  description: 'Real-time fraud detection, AML compliance, and automated risk assessment for high-volume transaction processing.',
  agentNodes,
  heroRun,
  monsterRun,
  runTemplates,
  accessPolicies,
  logTemplates,
};
