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
    id: 'intake-service',
    displayName: 'Intake Service',
    reasoners: [
      {
        id: 'triage-classifier',
        displayName: 'Triage Classifier',
        description: 'Categorizes incoming patient reports by specialty and severity.',
      },
      {
        id: 'urgency-scorer',
        displayName: 'Urgency Scorer',
        description: 'Calculates physiological stability and clinical urgency.',
      },
    ],
  },
  {
    id: 'clinical-reasoning',
    displayName: 'Clinical Reasoning',
    reasoners: [
      {
        id: 'differential-dx',
        displayName: 'Differential DX',
        description: 'Generates potential diagnoses based on symptoms and history.',
      },
      {
        id: 'evidence-gatherer',
        displayName: 'Evidence Gatherer',
        description: 'Retrieves supporting clinical data from medical literature and EHR.',
      },
      {
        id: 'contraindication-checker',
        displayName: 'Contraindication Checker',
        description: 'Identifies potential drug-drug or drug-condition interactions.',
      },
      {
        id: 'confidence-scorer',
        displayName: 'Confidence Scorer',
        description: 'Weights clinical evidence to assign confidence to hypotheses.',
      },
      {
        id: 'interaction-analyzer',
        displayName: 'Interaction Analyzer',
        description: 'Deep analysis of complex physiological interactions.',
      },
    ],
  },
  {
    id: 'compliance-gateway',
    displayName: 'Compliance Gateway',
    reasoners: [
      {
        id: 'hipaa-validator',
        displayName: 'HIPAA Validator',
        description: 'Ensures all processed data complies with HIPAA privacy rules.',
      },
      {
        id: 'audit-trail-signer',
        displayName: 'Audit Trail Signer',
        description: 'Cryptographically signs execution traces for auditability.',
      },
      {
        id: 'consent-verifier',
        displayName: 'Consent Verifier',
        description: 'Verifies patient authorization for data processing.',
      },
    ],
  },
  {
    id: 'notification-router',
    displayName: 'Notification Router',
    reasoners: [
      {
        id: 'care-team-notifier',
        displayName: 'Care Team Notifier',
        description: 'Alerts the appropriate medical staff via secure channels.',
      },
      {
        id: 'ehr-sync',
        displayName: 'EHR Sync',
        description: 'Synchronizes clinical findings back to the primary health record.',
      },
      {
        id: 'escalation-handler',
        displayName: 'Escalation Handler',
        description: 'Manages high-priority alerts requiring immediate intervention.',
      },
    ],
  },
];

// --- Hero Run Topology ---
const heroEdges: DemoDAGTopology['edges'] = [];

// Root and Triage
heroEdges.push([null, 'triage-classifier', 'intake-service']);
heroEdges.push(['triage-classifier', 'urgency-scorer', 'intake-service']);
heroEdges.push(['triage-classifier', 'consent-verifier', 'compliance-gateway']);

// Clinical Reasoning Start
heroEdges.push(['urgency-scorer', 'differential-dx', 'clinical-reasoning']);
heroEdges.push(['urgency-scorer', 'escalation-handler', 'notification-router']);

// Parallel Evidence Gathering (5 branches)
const specialties = ['cardiac', 'pulmonary', 'gi', 'neuro', 'metabolic'];
specialties.forEach((spec) => {
  const gatherer = `evidence-gatherer-${spec}`;
  const scorer = `confidence-scorer-${spec}`;
  const checker = `contraindication-checker-${spec}`;
  const analyzer = `interaction-analyzer-${spec}`;

  heroEdges.push(['differential-dx', gatherer, 'clinical-reasoning']);
  heroEdges.push([gatherer, scorer, 'clinical-reasoning']);
  heroEdges.push([scorer, checker, 'clinical-reasoning']);
  heroEdges.push([checker, analyzer, 'clinical-reasoning']);

  // All converge to hipaa-validator
  heroEdges.push([analyzer, 'hipaa-validator', 'compliance-gateway']);
});

// Closing the loop
heroEdges.push(['hipaa-validator', 'audit-trail-signer', 'compliance-gateway']);
heroEdges.push(['audit-trail-signer', 'care-team-notifier', 'notification-router']);
heroEdges.push(['care-team-notifier', 'ehr-sync', 'notification-router']);
heroEdges.push(['consent-verifier', 'ehr-sync', 'notification-router']);

// Add parallel audit logging and feedback loops to reach ~50 edges
specialties.forEach((spec) => {
  heroEdges.push([`evidence-gatherer-${spec}`, 'audit-trail-signer', 'compliance-gateway']);
  heroEdges.push([`interaction-analyzer-${spec}`, `confidence-scorer-${spec}`, 'clinical-reasoning']);
});
heroEdges.push(['triage-classifier', 'hipaa-validator', 'compliance-gateway']);
heroEdges.push(['urgency-scorer', 'hipaa-validator', 'compliance-gateway']);
heroEdges.push(['differential-dx', 'hipaa-validator', 'compliance-gateway']);
heroEdges.push(['escalation-handler', 'care-team-notifier', 'notification-router']);
heroEdges.push(['ehr-sync', 'audit-trail-signer', 'compliance-gateway']);
heroEdges.push(['audit-trail-signer', 'ehr-sync', 'notification-router']);

const heroRun: DemoRunTemplate = {
  displayName: 'Patient Intake Decision Support',
  rootReasoner: 'triage-classifier',
  agentNodeId: 'intake-service',
  participatingAgentNodes: ['intake-service', 'clinical-reasoning', 'compliance-gateway', 'notification-router'],
  topology: {
    edges: heroEdges,
    expectedNodeCount: 50,
  },
  durationRange: [10000, 15000],
};

// --- Monster Run Topology ---
const monsterEdges: DemoDAGTopology['edges'] = [];
monsterEdges.push([null, 'batch-dispatcher', 'intake-service']);
for (let i = 0; i < 20; i++) {
  const s = `-patient-${i}`;
  monsterEdges.push(['batch-dispatcher', `triage-classifier${s}`, 'intake-service']);
  monsterEdges.push([`triage-classifier${s}`, `urgency-scorer${s}`, 'intake-service']);
  monsterEdges.push([`urgency-scorer${s}`, `differential-dx${s}`, 'clinical-reasoning']);
  monsterEdges.push([`differential-dx${s}`, `evidence-gatherer-cardiac${s}`, 'clinical-reasoning']);
  monsterEdges.push([`differential-dx${s}`, `evidence-gatherer-pulmonary${s}`, 'clinical-reasoning']);
  monsterEdges.push([`evidence-gatherer-cardiac${s}`, `contraindication-checker${s}`, 'clinical-reasoning']);
  monsterEdges.push([`evidence-gatherer-pulmonary${s}`, `contraindication-checker${s}`, 'clinical-reasoning']);
  monsterEdges.push([`contraindication-checker${s}`, `hipaa-validator${s}`, 'compliance-gateway']);
  monsterEdges.push([`hipaa-validator${s}`, `audit-trail-signer${s}`, 'compliance-gateway']);
  monsterEdges.push([`audit-trail-signer${s}`, `care-team-notifier${s}`, 'notification-router']);
}

const monsterRun: DemoRunTemplate = {
  displayName: 'Batch Patient Intake Processing',
  rootReasoner: 'batch-dispatcher',
  agentNodeId: 'intake-service',
  participatingAgentNodes: ['intake-service', 'clinical-reasoning', 'compliance-gateway', 'notification-router'],
  topology: {
    edges: monsterEdges,
    expectedNodeCount: 201,
  },
  durationRange: [40000, 50000],
};

// --- Varied Run Templates (8 varied) ---
const runTemplates: DemoRunTemplate[] = [
  // 1-3: single-node (30%)
  {
    displayName: 'Quick Triage',
    rootReasoner: 'triage-classifier',
    agentNodeId: 'intake-service',
    participatingAgentNodes: ['intake-service'],
    topology: {
      edges: [
        [null, 'triage-classifier', 'intake-service'],
        ['triage-classifier', 'urgency-scorer', 'intake-service'],
      ],
      expectedNodeCount: 2,
    },
    durationRange: [1000, 2000],
  },
  {
    displayName: 'Evidence Lookup',
    rootReasoner: 'differential-dx',
    agentNodeId: 'clinical-reasoning',
    participatingAgentNodes: ['clinical-reasoning'],
    topology: {
      edges: [
        [null, 'differential-dx', 'clinical-reasoning'],
        ['differential-dx', 'evidence-gatherer', 'clinical-reasoning'],
        ['evidence-gatherer', 'contraindication-checker', 'clinical-reasoning'],
      ],
      expectedNodeCount: 3,
    },
    durationRange: [3000, 5000],
  },
  {
    displayName: 'Compliance Check',
    rootReasoner: 'hipaa-validator',
    agentNodeId: 'compliance-gateway',
    participatingAgentNodes: ['compliance-gateway'],
    topology: {
      edges: [
        [null, 'hipaa-validator', 'compliance-gateway'],
        ['hipaa-validator', 'audit-trail-signer', 'compliance-gateway'],
        ['audit-trail-signer', 'consent-verifier', 'compliance-gateway'],
      ],
      expectedNodeCount: 3,
    },
    durationRange: [2000, 4000],
  },
  // 4-5: two-node (45%)
  {
    displayName: 'HIPAA Validation',
    rootReasoner: 'triage-classifier',
    agentNodeId: 'intake-service',
    participatingAgentNodes: ['intake-service', 'compliance-gateway'],
    topology: {
      edges: [
        [null, 'triage-classifier', 'intake-service'],
        ['triage-classifier', 'urgency-scorer', 'intake-service'],
        ['urgency-scorer', 'hipaa-validator', 'compliance-gateway'],
        ['hipaa-validator', 'audit-trail-signer', 'compliance-gateway'],
        ['audit-trail-signer', 'consent-verifier', 'compliance-gateway'],
      ],
      expectedNodeCount: 5,
    },
    durationRange: [4000, 6000],
  },
  {
    displayName: 'Clinical Compliance Audit',
    rootReasoner: 'differential-dx',
    agentNodeId: 'clinical-reasoning',
    participatingAgentNodes: ['clinical-reasoning', 'compliance-gateway'],
    topology: {
      edges: [
        [null, 'differential-dx', 'clinical-reasoning'],
        ['differential-dx', 'evidence-gatherer', 'clinical-reasoning'],
        ['evidence-gatherer', 'hipaa-validator', 'compliance-gateway'],
        ['hipaa-validator', 'audit-trail-signer', 'compliance-gateway'],
        ['audit-trail-signer', 'consent-verifier', 'compliance-gateway'],
      ],
      expectedNodeCount: 5,
    },
    durationRange: [5000, 8000],
  },
  // 6-8: three-four-node (25%)
  {
    displayName: 'Full Clinical Assessment',
    rootReasoner: 'triage-classifier',
    agentNodeId: 'intake-service',
    participatingAgentNodes: ['intake-service', 'clinical-reasoning', 'compliance-gateway'],
    topology: {
      edges: [
        [null, 'triage-classifier', 'intake-service'],
        ['triage-classifier', 'urgency-scorer', 'intake-service'],
        ['urgency-scorer', 'differential-dx', 'clinical-reasoning'],
        ['differential-dx', 'evidence-gatherer-1', 'clinical-reasoning'],
        ['differential-dx', 'evidence-gatherer-2', 'clinical-reasoning'],
        ['evidence-gatherer-1', 'contraindication-checker', 'clinical-reasoning'],
        ['evidence-gatherer-2', 'contraindication-checker', 'clinical-reasoning'],
        ['contraindication-checker', 'hipaa-validator', 'compliance-gateway'],
        ['hipaa-validator', 'audit-trail-signer', 'compliance-gateway'],
        ['audit-trail-signer', 'consent-verifier', 'compliance-gateway'],
        ['consent-verifier', 'ehr-sync', 'notification-router'],
        ['ehr-sync', 'care-team-notifier', 'notification-router'],
      ],
      expectedNodeCount: 12,
    },
    durationRange: [8000, 12000],
  },
  {
    displayName: 'Emergency Escalation',
    rootReasoner: 'triage-classifier',
    agentNodeId: 'intake-service',
    participatingAgentNodes: ['intake-service', 'clinical-reasoning', 'notification-router'],
    topology: {
      edges: [
        [null, 'triage-classifier', 'intake-service'],
        ['triage-classifier', 'urgency-scorer', 'intake-service'],
        ['urgency-scorer', 'differential-dx', 'clinical-reasoning'],
        ['differential-dx', 'evidence-1', 'clinical-reasoning'],
        ['differential-dx', 'evidence-2', 'clinical-reasoning'],
        ['evidence-2', 'escalation-handler', 'notification-router'],
        ['escalation-handler', 'care-team-notifier', 'notification-router'],
        ['care-team-notifier', 'ehr-sync', 'notification-router'],
      ],
      expectedNodeCount: 8,
    },
    durationRange: [5000, 8000],
  },
  {
    displayName: 'Multi-Patient Round',
    rootReasoner: 'batch-dispatcher',
    agentNodeId: 'intake-service',
    participatingAgentNodes: ['intake-service', 'clinical-reasoning', 'compliance-gateway', 'notification-router'],
    topology: {
      edges: [
        [null, 'batch-dispatcher', 'intake-service'],
        ['batch-dispatcher', 'patient-1', 'intake-service'],
        ['batch-dispatcher', 'patient-2', 'intake-service'],
        ['batch-dispatcher', 'patient-3', 'intake-service'],
        // patient 1
        ['patient-1', 'triage-1', 'intake-service'],
        ['triage-1', 'dx-1', 'clinical-reasoning'],
        ['dx-1', 'hipaa-1', 'compliance-gateway'],
        ['hipaa-1', 'notify-1', 'notification-router'],
        ['notify-1', 'ehr-1', 'notification-router'],
        // patient 2
        ['patient-2', 'triage-2', 'intake-service'],
        ['triage-2', 'dx-2', 'clinical-reasoning'],
        ['dx-2', 'hipaa-2', 'compliance-gateway'],
        ['hipaa-2', 'notify-2', 'notification-router'],
        ['notify-2', 'ehr-2', 'notification-router'],
        // patient 3
        ['patient-3', 'triage-3', 'intake-service'],
        ['triage-3', 'dx-3', 'clinical-reasoning'],
        ['dx-3', 'hipaa-3', 'compliance-gateway'],
        ['hipaa-3', 'notify-3', 'notification-router'],
        ['notify-3', 'ehr-3', 'notification-router'],
        // Final sync
        ['ehr-1', 'audit-all', 'compliance-gateway'],
        ['ehr-2', 'audit-all', 'compliance-gateway'],
        ['ehr-3', 'audit-all', 'compliance-gateway'],
      ],
      expectedNodeCount: 20,
    },
    durationRange: [15000, 25000],
  },
];

// --- Access Policies ---
const accessPolicies: DemoAccessPolicy[] = [
  {
    id: 'hipaa-data-scope',
    name: 'HIPAA Data Scope',
    description: 'Enforces strict PHI access boundaries across all services.',
    enabled: true,
    createdAt: new Date().toISOString(),
    rules: [
      {
        id: 'allow-compliance-phi',
        effect: 'allow',
        targetAgentNode: 'compliance-gateway',
        description: 'Allow compliance nodes full access to PHI fields for validation.',
      },
      {
        id: 'deny-non-compliance-phi',
        effect: 'deny',
        condition: 'request.tags.contains("PHI")',
        description: 'Deny access to PHI fields for any node not in the compliance-gateway.',
      },
    ],
  },
  {
    id: 'clinical-write-access',
    name: 'Clinical Write Access',
    description: 'Restricts medical diagnosis capabilities to authorized reasoning agents.',
    enabled: true,
    createdAt: new Date().toISOString(),
    rules: [
      {
        id: 'allow-clinical-dx',
        effect: 'allow',
        targetAgentNode: 'clinical-reasoning',
        targetReasoner: 'differential-dx',
        description: 'Allow clinical-reasoning agents to invoke diagnostic reasoners.',
      },
      {
        id: 'deny-other-dx',
        effect: 'deny',
        targetReasoner: 'differential-dx',
        description: 'Prevent non-clinical agents from triggering diagnostic logic.',
      },
    ],
  },
  {
    id: 'audit-mandatory',
    name: 'Audit Mandatory',
    description: 'Ensures every clinical decision is cryptographically signed before completion.',
    enabled: true,
    createdAt: new Date().toISOString(),
    rules: [
      {
        id: 'deny-completion-without-audit',
        effect: 'deny',
        condition: '!execution.visited_nodes.contains("audit-trail-signer")',
        description: 'Deny workflow completion if the audit-trail-signer was not invoked.',
      },
    ],
  },
];

// --- Log Templates (20+) ---
const logTemplates: DemoLogTemplate[] = [
  {
    agentNode: 'intake-service',
    reasoner: 'triage-classifier',
    level: 'INFO',
    messageTemplate: 'Received patient intake form — age: {age}, chief complaint: {complaint}',
  },
  {
    agentNode: 'intake-service',
    reasoner: 'urgency-scorer',
    level: 'INFO',
    messageTemplate: 'Urgency score: {score} ({urgencyLevel}) — {riskFactor} flagged',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'differential-dx',
    level: 'INFO',
    messageTemplate: 'Spawning {count} parallel evidence gatherers for hypothesis evaluation',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'evidence-gatherer',
    level: 'DEBUG',
    messageTemplate: 'Querying clinical knowledge base: "{query}"',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'evidence-gatherer',
    level: 'INFO',
    messageTemplate: '{indicatorCount} supporting indicators found, confidence: {confidence}',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'contraindication-checker',
    level: 'WARN',
    messageTemplate: 'Contraindication detected: patient on {medication} — flagging for review',
  },
  {
    agentNode: 'compliance-gateway',
    reasoner: 'hipaa-validator',
    level: 'INFO',
    messageTemplate: 'PHI access audit logged — accessor: {accessor}, justification: {justification}',
  },
  {
    agentNode: 'compliance-gateway',
    reasoner: 'audit-trail-signer',
    level: 'INFO',
    messageTemplate: 'Signing execution VC — DID: did:agentfield:{agentNode}',
  },
  {
    agentNode: 'notification-router',
    reasoner: 'care-team-notifier',
    level: 'INFO',
    messageTemplate: 'Routing to {specialty} on-call: {doctorName} — priority: {priority}',
  },
  {
    agentNode: 'notification-router',
    reasoner: 'ehr-sync',
    level: 'INFO',
    messageTemplate: 'Syncing clinical decision to EHR system — record ID: {recordId}',
  },
  {
    agentNode: 'intake-service',
    reasoner: 'triage-classifier',
    level: 'DEBUG',
    messageTemplate: 'Parsing NLP entities from complaint: {entities}',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'confidence-scorer',
    level: 'INFO',
    messageTemplate: 'Bayesian update complete: posterior probability for {diagnosis} is {prob}',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'interaction-analyzer',
    level: 'DEBUG',
    messageTemplate: 'Simulating physiological interaction: {agentA} + {agentB}',
  },
  {
    agentNode: 'compliance-gateway',
    reasoner: 'consent-verifier',
    level: 'INFO',
    messageTemplate: 'Consent verified for patient {patientId} — Scope: {scope}',
  },
  {
    agentNode: 'notification-router',
    reasoner: 'escalation-handler',
    level: 'WARN',
    messageTemplate: 'High-urgency escalation triggered for patient {patientId}',
  },
  {
    agentNode: 'intake-service',
    reasoner: 'urgency-scorer',
    level: 'DEBUG',
    messageTemplate: 'Input vitals: BP {bp}, HR {hr}, Temp {temp}',
  },
  {
    agentNode: 'clinical-reasoning',
    reasoner: 'evidence-gatherer',
    level: 'ERROR',
    messageTemplate: 'Timeout connecting to external medical knowledge base {provider}',
  },
  {
    agentNode: 'compliance-gateway',
    reasoner: 'hipaa-validator',
    level: 'WARN',
    messageTemplate: 'Potential PHI leakage detected in reasoner {sourceReasoner} — masking field {field}',
  },
  {
    agentNode: 'notification-router',
    reasoner: 'care-team-notifier',
    level: 'DEBUG',
    messageTemplate: 'Attempting notification via {channel} to {userId}',
  },
  {
    agentNode: 'notification-router',
    reasoner: 'ehr-sync',
    level: 'DEBUG',
    messageTemplate: 'EHR API Latency: {latency}ms',
  },
];

export const healthcareScenario: DemoScenario = {
  vertical: 'healthcare',
  label: 'Healthcare',
  description: 'AI-assisted patient intake, clinical decision support, and HIPAA-compliant reasoning workflows.',
  agentNodes,
  heroRun,
  monsterRun,
  runTemplates,
  accessPolicies,
  logTemplates,
};
