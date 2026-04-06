import type {
  DemoScenario,
  DemoAgentNodeConfig,
  DemoRunTemplate,
  DemoDAGTopology,
  DemoAccessPolicy,
  DemoAccessRule,
  DemoLogTemplate,
} from '../types';

const agentNodes: DemoAgentNodeConfig[] = [
  {
    id: 'api-gateway-intel',
    displayName: 'API Gateway Intelligence',
    reasoners: [
      {
        id: 'request-classifier',
        displayName: 'Request Classifier',
        description: 'Classifies inbound API traffic by endpoint, tenant, and execution pattern.',
      },
      {
        id: 'intent-detector',
        displayName: 'Intent Detector',
        description: 'Infers the likely customer or system intent behind a burst of API requests.',
      },
      {
        id: 'rate-limit-advisor',
        displayName: 'Rate Limit Advisor',
        description: 'Recommends throttling and protection policies based on observed traffic conditions.',
      },
    ],
    deploymentType: 'serverless',
    version: '1.0.0',
  },
  {
    id: 'content-pipeline',
    displayName: 'Content Pipeline',
    reasoners: [
      {
        id: 'content-analyzer',
        displayName: 'Content Analyzer',
        description: 'Inspects unstructured content for quality, anomalies, and processing requirements.',
      },
      {
        id: 'toxicity-filter',
        displayName: 'Toxicity Filter',
        description: 'Flags harmful or abusive content before it proceeds to downstream systems.',
      },
      {
        id: 'pii-redactor',
        displayName: 'PII Redactor',
        description: 'Removes or masks personal data before content leaves the pipeline.',
      },
      {
        id: 'summarizer',
        displayName: 'Summarizer',
        description: 'Produces compact operational summaries from sanitized content and incident context.',
      },
    ],
    deploymentType: 'long_running',
    version: '1.0.0',
  },
  {
    id: 'recommendation-engine',
    displayName: 'Recommendation Engine',
    reasoners: [
      {
        id: 'user-profiler',
        displayName: 'User Profiler',
        description: 'Builds a behavioral profile to personalize ranking and routing decisions.',
      },
      {
        id: 'candidate-ranker',
        displayName: 'Candidate Ranker',
        description: 'Scores candidate actions or content items against business and relevance objectives.',
      },
      {
        id: 'diversity-enforcer',
        displayName: 'Diversity Enforcer',
        description: 'Balances ranked outputs to avoid over-concentration and maintain healthy variation.',
      },
      {
        id: 'a-b-router',
        displayName: 'A/B Router',
        description: 'Routes workloads into experiment cohorts to compare model and policy outcomes.',
      },
    ],
    deploymentType: 'serverless',
    version: '1.0.0',
  },
  {
    id: 'ops-automation',
    displayName: 'Ops Automation',
    reasoners: [
      {
        id: 'alert-triager',
        displayName: 'Alert Triager',
        description: 'Prioritizes incoming alerts and determines which incidents require automation.',
      },
      {
        id: 'root-cause-analyzer',
        displayName: 'Root Cause Analyzer',
        description: 'Correlates telemetry and change history to isolate the most likely failure domain.',
      },
      {
        id: 'runbook-executor',
        displayName: 'Runbook Executor',
        description: 'Executes approved remediation playbooks against affected infrastructure and services.',
      },
      {
        id: 'incident-summarizer',
        displayName: 'Incident Summarizer',
        description: 'Produces an incident narrative with remediation status, tenant impact, and next steps.',
      },
    ],
    deploymentType: 'long_running',
    version: '1.0.0',
  },
  {
    id: 'billing-intelligence',
    displayName: 'Billing Intelligence',
    reasoners: [
      {
        id: 'usage-analyzer',
        displayName: 'Usage Analyzer',
        description: 'Measures demand shifts and tenant consumption changes during operational events.',
      },
      {
        id: 'churn-predictor',
        displayName: 'Churn Predictor',
        description: 'Estimates retention risk from service degradation, billing behavior, and product usage.',
      },
      {
        id: 'upsell-scorer',
        displayName: 'Upsell Scorer',
        description: 'Identifies expansion opportunities after stabilizing high-value customer accounts.',
      },
    ],
    deploymentType: 'serverless',
    version: '1.0.0',
  },
];

const countEdges = (edges: DemoDAGTopology['edges']): number => edges.length;

const heroEdges: DemoDAGTopology['edges'] = [
  [null, 'alert-triager', 'ops-automation'],
  ['alert-triager', 'root-cause-analyzer', 'ops-automation'],
  ['root-cause-analyzer', 'request-classifier', 'api-gateway-intel'],
  ['root-cause-analyzer', 'content-analyzer', 'content-pipeline'],
  ['root-cause-analyzer', 'usage-analyzer', 'billing-intelligence'],
  ['usage-analyzer', 'runbook-executor-scale-up', 'ops-automation'],
  ['usage-analyzer', 'runbook-executor-cache-flush', 'ops-automation'],
  ['usage-analyzer', 'runbook-executor-circuit-break', 'ops-automation'],
  ['usage-analyzer', 'runbook-executor-rollback-deploy', 'ops-automation'],
  ['usage-analyzer', 'runbook-executor-dns-failover', 'ops-automation'],
  ['runbook-executor-scale-up', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-cache-flush', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-circuit-break', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-rollback-deploy', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-dns-failover', 'incident-summarizer', 'ops-automation'],
  ['incident-summarizer', 'churn-predictor', 'billing-intelligence'],
  ['alert-triager', 'pii-redactor', 'content-pipeline'],
  ['alert-triager', 'a-b-router', 'recommendation-engine'],
  ['request-classifier', 'intent-detector', 'api-gateway-intel'],
  ['intent-detector', 'rate-limit-advisor', 'api-gateway-intel'],
  ['content-analyzer', 'toxicity-filter', 'content-pipeline'],
  ['toxicity-filter', 'summarizer', 'content-pipeline'],
  ['a-b-router', 'user-profiler', 'recommendation-engine'],
  ['user-profiler', 'candidate-ranker', 'recommendation-engine'],
  ['candidate-ranker', 'diversity-enforcer', 'recommendation-engine'],
  ['churn-predictor', 'upsell-scorer', 'billing-intelligence'],
  ['runbook-executor-scale-up', 'request-classifier-scale-up', 'api-gateway-intel'],
  ['request-classifier-scale-up', 'intent-detector-scale-up', 'api-gateway-intel'],
  ['intent-detector-scale-up', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-cache-flush', 'content-analyzer-cache', 'content-pipeline'],
  ['content-analyzer-cache', 'summarizer-cache', 'content-pipeline'],
  ['summarizer-cache', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-circuit-break', 'request-classifier-circuit', 'api-gateway-intel'],
  ['request-classifier-circuit', 'rate-limit-advisor-circuit', 'api-gateway-intel'],
  ['rate-limit-advisor-circuit', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-rollback-deploy', 'content-analyzer-rollback', 'content-pipeline'],
  ['content-analyzer-rollback', 'pii-redactor-rollback', 'content-pipeline'],
  ['pii-redactor-rollback', 'incident-summarizer', 'ops-automation'],
  ['runbook-executor-dns-failover', 'user-profiler-dns', 'recommendation-engine'],
  ['user-profiler-dns', 'candidate-ranker-dns', 'recommendation-engine'],
  ['candidate-ranker-dns', 'incident-summarizer', 'ops-automation'],
  ['pii-redactor', 'summarizer-alert-sanitized', 'content-pipeline'],
  ['summarizer-alert-sanitized', 'incident-summarizer', 'ops-automation'],
  ['usage-analyzer', 'request-classifier-tenant-impact', 'api-gateway-intel'],
  ['request-classifier-tenant-impact', 'intent-detector-tenant-impact', 'api-gateway-intel'],
  ['intent-detector-tenant-impact', 'churn-predictor', 'billing-intelligence'],
  ['diversity-enforcer', 'upsell-scorer', 'billing-intelligence'],
  ['content-analyzer', 'pii-redactor-content-snapshot', 'content-pipeline'],
  ['pii-redactor-content-snapshot', 'summarizer-content-snapshot', 'content-pipeline'],
  ['summarizer-content-snapshot', 'incident-summarizer', 'ops-automation'],
];

const monsterEdges: DemoDAGTopology['edges'] = [];
monsterEdges.push([null, 'content-analyzer-dispatch', 'content-pipeline']);
for (let i = 0; i < 50; i += 1) {
  const suffix = `-batch-${i}`;
  monsterEdges.push(['content-analyzer-dispatch', `content-analyzer${suffix}`, 'content-pipeline']);
  monsterEdges.push([`content-analyzer${suffix}`, `toxicity-filter${suffix}`, 'content-pipeline']);
  monsterEdges.push([`toxicity-filter${suffix}`, `pii-redactor${suffix}`, 'content-pipeline']);
  monsterEdges.push([`pii-redactor${suffix}`, `summarizer${suffix}`, 'content-pipeline']);
  monsterEdges.push([`summarizer${suffix}`, `candidate-ranker${suffix}`, 'recommendation-engine']);
}

const heroRun: DemoRunTemplate = {
  displayName: 'Intelligent Incident Response Pipeline',
  rootReasoner: 'alert-triager',
  agentNodeId: 'ops-automation',
  topology: {
    edges: heroEdges,
    expectedNodeCount: 50,
  },
  participatingAgentNodes: [
    'ops-automation',
    'api-gateway-intel',
    'content-pipeline',
    'recommendation-engine',
    'billing-intelligence',
  ],
  durationRange: [10000, 15000],
};

const monsterRun: DemoRunTemplate = {
  displayName: 'Content Moderation Batch Processing',
  rootReasoner: 'content-analyzer-dispatch',
  agentNodeId: 'content-pipeline',
  topology: {
    edges: monsterEdges,
    expectedNodeCount: 251,
  },
  participatingAgentNodes: ['content-pipeline', 'recommendation-engine'],
  durationRange: [40000, 55000],
};

const runTemplates: DemoRunTemplate[] = [
  {
    displayName: 'API Traffic Analysis',
    rootReasoner: 'request-classifier',
    agentNodeId: 'api-gateway-intel',
    topology: {
      edges: [
        [null, 'request-classifier', 'api-gateway-intel'],
        ['request-classifier', 'intent-detector', 'api-gateway-intel'],
        ['intent-detector', 'rate-limit-advisor', 'api-gateway-intel'],
      ],
      expectedNodeCount: 3,
    },
    participatingAgentNodes: ['api-gateway-intel'],
    durationRange: [2500, 4500],
  },
  {
    displayName: 'Content Safety Check',
    rootReasoner: 'content-analyzer',
    agentNodeId: 'content-pipeline',
    topology: {
      edges: [
        [null, 'content-analyzer', 'content-pipeline'],
        ['content-analyzer', 'toxicity-filter', 'content-pipeline'],
        ['toxicity-filter', 'pii-redactor', 'content-pipeline'],
        ['pii-redactor', 'summarizer', 'content-pipeline'],
      ],
      expectedNodeCount: 4,
    },
    participatingAgentNodes: ['content-pipeline'],
    durationRange: [3000, 5000],
  },
  {
    displayName: 'Personalized Recommendation',
    rootReasoner: 'user-profiler',
    agentNodeId: 'recommendation-engine',
    topology: {
      edges: [
        [null, 'user-profiler', 'recommendation-engine'],
        ['user-profiler', 'candidate-ranker', 'recommendation-engine'],
        ['candidate-ranker', 'diversity-enforcer', 'recommendation-engine'],
        ['diversity-enforcer', 'a-b-router', 'recommendation-engine'],
      ],
      expectedNodeCount: 4,
    },
    participatingAgentNodes: ['recommendation-engine'],
    durationRange: [3500, 5500],
  },
  {
    displayName: 'Incident Triage',
    rootReasoner: 'alert-triager',
    agentNodeId: 'ops-automation',
    topology: {
      edges: [
        [null, 'alert-triager', 'ops-automation'],
        ['alert-triager', 'root-cause-analyzer', 'ops-automation'],
        ['root-cause-analyzer', 'request-classifier', 'api-gateway-intel'],
        ['request-classifier', 'runbook-executor', 'ops-automation'],
        ['runbook-executor', 'incident-summarizer', 'ops-automation'],
        ['alert-triager', 'pii-redactor', 'content-pipeline'],
      ],
      expectedNodeCount: 6,
    },
    participatingAgentNodes: ['ops-automation', 'api-gateway-intel', 'content-pipeline'],
    durationRange: [6000, 9000],
  },
  {
    displayName: 'Usage Spike Analysis',
    rootReasoner: 'usage-analyzer',
    agentNodeId: 'billing-intelligence',
    topology: {
      edges: [
        [null, 'usage-analyzer', 'billing-intelligence'],
        ['usage-analyzer', 'churn-predictor', 'billing-intelligence'],
        ['churn-predictor', 'upsell-scorer', 'billing-intelligence'],
        ['usage-analyzer', 'content-analyzer', 'content-pipeline'],
        ['content-analyzer', 'summarizer', 'content-pipeline'],
      ],
      expectedNodeCount: 5,
    },
    participatingAgentNodes: ['billing-intelligence', 'content-pipeline'],
    durationRange: [4500, 7000],
  },
  {
    displayName: 'Full Content Pipeline',
    rootReasoner: 'content-analyzer',
    agentNodeId: 'content-pipeline',
    topology: {
      edges: [
        [null, 'content-analyzer', 'content-pipeline'],
        ['content-analyzer', 'toxicity-filter', 'content-pipeline'],
        ['toxicity-filter', 'pii-redactor', 'content-pipeline'],
        ['pii-redactor', 'summarizer', 'content-pipeline'],
        ['summarizer', 'user-profiler', 'recommendation-engine'],
        ['user-profiler', 'candidate-ranker', 'recommendation-engine'],
        ['candidate-ranker', 'diversity-enforcer', 'recommendation-engine'],
        ['diversity-enforcer', 'a-b-router', 'recommendation-engine'],
        ['summarizer', 'request-classifier', 'api-gateway-intel'],
        ['request-classifier', 'intent-detector', 'api-gateway-intel'],
        ['intent-detector', 'rate-limit-advisor', 'api-gateway-intel'],
        ['a-b-router', 'upsell-scorer', 'billing-intelligence'],
      ],
      expectedNodeCount: 12,
    },
    participatingAgentNodes: [
      'content-pipeline',
      'recommendation-engine',
      'api-gateway-intel',
      'billing-intelligence',
    ],
    durationRange: [9000, 13000],
  },
  {
    displayName: 'Automated Remediation',
    rootReasoner: 'alert-triager',
    agentNodeId: 'ops-automation',
    topology: {
      edges: [
        [null, 'alert-triager', 'ops-automation'],
        ['alert-triager', 'root-cause-analyzer', 'ops-automation'],
        ['root-cause-analyzer', 'runbook-executor-scale-up', 'ops-automation'],
        ['root-cause-analyzer', 'runbook-executor-cache-flush', 'ops-automation'],
        ['root-cause-analyzer', 'runbook-executor-rollback', 'ops-automation'],
        ['root-cause-analyzer', 'request-classifier', 'api-gateway-intel'],
        ['request-classifier', 'intent-detector', 'api-gateway-intel'],
        ['root-cause-analyzer', 'pii-redactor', 'content-pipeline'],
        ['runbook-executor-scale-up', 'incident-summarizer', 'ops-automation'],
        ['runbook-executor-cache-flush', 'incident-summarizer', 'ops-automation'],
        ['runbook-executor-rollback', 'incident-summarizer', 'ops-automation'],
        ['incident-summarizer', 'churn-predictor', 'billing-intelligence'],
        ['churn-predictor', 'upsell-scorer', 'billing-intelligence'],
        ['pii-redactor', 'summarizer', 'content-pipeline'],
        ['intent-detector', 'rate-limit-advisor', 'api-gateway-intel'],
      ],
      expectedNodeCount: 15,
    },
    participatingAgentNodes: [
      'ops-automation',
      'api-gateway-intel',
      'content-pipeline',
      'billing-intelligence',
    ],
    durationRange: [11000, 16000],
  },
  {
    displayName: 'Revenue Impact Assessment',
    rootReasoner: 'usage-analyzer',
    agentNodeId: 'billing-intelligence',
    topology: {
      edges: [
        [null, 'usage-analyzer', 'billing-intelligence'],
        ['usage-analyzer', 'churn-predictor', 'billing-intelligence'],
        ['churn-predictor', 'upsell-scorer', 'billing-intelligence'],
        ['upsell-scorer', 'incident-summarizer', 'ops-automation'],
        ['usage-analyzer', 'alert-triager', 'ops-automation'],
        ['alert-triager', 'root-cause-analyzer', 'ops-automation'],
        ['root-cause-analyzer', 'content-analyzer', 'content-pipeline'],
        ['content-analyzer', 'summarizer', 'content-pipeline'],
      ],
      expectedNodeCount: 8,
    },
    participatingAgentNodes: ['billing-intelligence', 'ops-automation', 'content-pipeline'],
    durationRange: [7000, 10000],
  },
];

const piiFirewallRules: DemoAccessRule[] = [
  {
    id: 'rule-1',
    effect: 'deny',
    sourceTag: 'content-handler',
    targetReasoner: 'candidate-ranker',
    description: 'Block content handlers from directly invoking recommendation ranker without PII redaction',
  },
  {
    id: 'rule-2',
    effect: 'allow',
    sourceTag: 'pii-cleared',
    targetReasoner: 'candidate-ranker',
    description: 'Allow PII-cleared content to flow to recommendation engine',
  },
];

const modelAccessRules: DemoAccessRule[] = [
  {
    id: 'rule-3',
    effect: 'allow',
    sourceTag: 'ml-authorized',
    targetAgentNode: 'recommendation-engine',
    description: 'Allow ML-authorized agents to invoke recommendation engine',
  },
  {
    id: 'rule-4',
    effect: 'deny',
    targetAgentNode: 'recommendation-engine',
    description: 'Deny all other access to recommendation engine reasoners',
  },
];

const opsBlastRadiusRules: DemoAccessRule[] = [
  {
    id: 'rule-5',
    effect: 'allow',
    sourceTag: 'ops-team',
    targetReasoner: 'runbook-executor',
    condition: 'concurrent_invocations < 3',
    description: 'Allow ops team to run up to 3 concurrent remediations',
  },
  {
    id: 'rule-6',
    effect: 'deny',
    targetReasoner: 'runbook-executor',
    condition: 'concurrent_invocations >= 3',
    description: 'Block additional remediations when 3 are already running',
  },
];

const billingReadonlyRules: DemoAccessRule[] = [
  {
    id: 'rule-7',
    effect: 'allow',
    sourceTag: 'billing-reader',
    targetAgentNode: 'billing-intelligence',
    condition: 'operation == "read"',
    description: 'Allow billing readers to query billing intelligence',
  },
  {
    id: 'rule-8',
    effect: 'deny',
    targetAgentNode: 'billing-intelligence',
    condition: 'operation == "write"',
    description: 'Block all write operations to billing data',
  },
];

const accessPolicies: DemoAccessPolicy[] = [
  {
    id: 'policy-pii-firewall',
    name: 'PII Firewall',
    description: 'Content pipeline agents must route through pii-redactor before any data leaves the node',
    enabled: true,
    createdAt: '2026-03-15T10:00:00Z',
    rules: piiFirewallRules,
  },
  {
    id: 'policy-model-access',
    name: 'ML Model Access Control',
    description: 'Only recommendation-engine agents can invoke ML model inference endpoints',
    enabled: true,
    createdAt: '2026-03-10T14:30:00Z',
    rules: modelAccessRules,
  },
  {
    id: 'policy-ops-blast-radius',
    name: 'Ops Blast Radius Limit',
    description: 'Runbook executor limited to max 3 concurrent remediation actions per incident',
    enabled: true,
    createdAt: '2026-03-20T09:00:00Z',
    rules: opsBlastRadiusRules,
  },
  {
    id: 'policy-billing-readonly',
    name: 'Billing Read-Only Access',
    description: 'Billing intelligence has read-only access to transaction data — no write operations permitted',
    enabled: true,
    createdAt: '2026-03-12T16:00:00Z',
    rules: billingReadonlyRules,
  },
];

const logTemplates: DemoLogTemplate[] = [
  {
    agentNode: 'ops-automation',
    reasoner: 'alert-triager',
    level: 'INFO',
    messageTemplate: 'PagerDuty alert received: API latency p99 > {latencyMs}ms (threshold: 500ms)',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'alert-triager',
    level: 'INFO',
    messageTemplate: 'Incident {incidentId} promoted to Sev-{severity} after tenant error budget burn reached {burnRate}x',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'root-cause-analyzer',
    level: 'INFO',
    messageTemplate: 'Correlating with {sourceCount} data sources: metrics, deploy log, error rates',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'root-cause-analyzer',
    level: 'INFO',
    messageTemplate: 'Root cause identified: {component} cold-start after deploy v{version}',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'runbook-executor',
    level: 'INFO',
    messageTemplate: 'Flushing {cacheType} cache — ETA: {etaSeconds}s',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'runbook-executor',
    level: 'INFO',
    messageTemplate: 'Scaling {service} replicas: {fromCount} → {toCount}',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'runbook-executor',
    level: 'WARN',
    messageTemplate: 'Deploy rollback initiated: v{newVersion} → v{oldVersion}',
  },
  {
    agentNode: 'ops-automation',
    reasoner: 'incident-summarizer',
    level: 'INFO',
    messageTemplate: 'Incident summary generated — MTTR: {mttrSeconds}s, affected tenants: {tenantCount}, revenue impact: ${impact}',
  },
  {
    agentNode: 'api-gateway-intel',
    reasoner: 'request-classifier',
    level: 'DEBUG',
    messageTemplate: 'Analyzing traffic pattern: {percentage}% requests hitting /api/v2/{endpoint}',
  },
  {
    agentNode: 'api-gateway-intel',
    reasoner: 'request-classifier',
    level: 'INFO',
    messageTemplate: 'Traffic classified as {trafficClass} for tenant {tenantName} across {requestCount} requests',
  },
  {
    agentNode: 'api-gateway-intel',
    reasoner: 'intent-detector',
    level: 'INFO',
    messageTemplate: 'Intent detector mapped surge to {intentCategory} workflow triggered by {clientType}',
  },
  {
    agentNode: 'api-gateway-intel',
    reasoner: 'intent-detector',
    level: 'DEBUG',
    messageTemplate: 'Intent confidence {confidence}% using signature {signatureId}',
  },
  {
    agentNode: 'api-gateway-intel',
    reasoner: 'rate-limit-advisor',
    level: 'INFO',
    messageTemplate: 'Recommended throttle profile {profileName} for route /api/{route} to protect downstream services',
  },
  {
    agentNode: 'content-pipeline',
    reasoner: 'content-analyzer',
    level: 'INFO',
    messageTemplate: 'Content processing queue depth: {queueDepth} (normal: ~50) — likely bottleneck',
  },
  {
    agentNode: 'content-pipeline',
    reasoner: 'content-analyzer',
    level: 'INFO',
    messageTemplate: 'Parsed content bundle {bundleId} with {documentCount} artifacts and {attachmentCount} attachments',
  },
  {
    agentNode: 'content-pipeline',
    reasoner: 'toxicity-filter',
    level: 'INFO',
    messageTemplate: 'Toxicity filter scored batch {batchId} at {toxicityScore}; policy outcome: {policyOutcome}',
  },
  {
    agentNode: 'content-pipeline',
    reasoner: 'toxicity-filter',
    level: 'DEBUG',
    messageTemplate: 'Flagged phrase cluster {clusterId} in locale {locale} for manual review fallback',
  },
  {
    agentNode: 'content-pipeline',
    reasoner: 'pii-redactor',
    level: 'INFO',
    messageTemplate: 'Redacted {fieldCount} sensitive fields from tenant {tenantName} before cross-node routing',
  },
  {
    agentNode: 'content-pipeline',
    reasoner: 'summarizer',
    level: 'INFO',
    messageTemplate: 'Generated summary card for incident {incidentId} with {bulletCount} action items',
  },
  {
    agentNode: 'recommendation-engine',
    reasoner: 'user-profiler',
    level: 'INFO',
    messageTemplate: 'Profile refreshed for account {accountId}: engagement={engagementBand}, risk={riskBand}',
  },
  {
    agentNode: 'recommendation-engine',
    reasoner: 'candidate-ranker',
    level: 'INFO',
    messageTemplate: 'Ranked {candidateCount} candidates for tenant {tenantName}; top action={topAction}',
  },
  {
    agentNode: 'recommendation-engine',
    reasoner: 'candidate-ranker',
    level: 'DEBUG',
    messageTemplate: 'Feature weights recalibrated using experiment bucket {bucketId}',
  },
  {
    agentNode: 'recommendation-engine',
    reasoner: 'diversity-enforcer',
    level: 'INFO',
    messageTemplate: 'Diversity guardrail applied: max category share reduced to {maxShare}%',
  },
  {
    agentNode: 'recommendation-engine',
    reasoner: 'a-b-router',
    level: 'INFO',
    messageTemplate: 'Assigned tenant {tenantName} to experiment {experimentId}:{variant}',
  },
  {
    agentNode: 'billing-intelligence',
    reasoner: 'usage-analyzer',
    level: 'INFO',
    messageTemplate: 'Usage spike detected: {multiplier}x normal for tenant {tenantName} (plan: {plan})',
  },
  {
    agentNode: 'billing-intelligence',
    reasoner: 'usage-analyzer',
    level: 'INFO',
    messageTemplate: 'Computed hourly burn impact ${burnImpact} across {regionCount} regions',
  },
  {
    agentNode: 'billing-intelligence',
    reasoner: 'churn-predictor',
    level: 'INFO',
    messageTemplate: 'Impact assessment: churn risk delta +{delta} for {tenantName} — within tolerance',
  },
  {
    agentNode: 'billing-intelligence',
    reasoner: 'upsell-scorer',
    level: 'INFO',
    messageTemplate: 'Expansion signal detected for tenant {tenantName}: recommended package {packageName}',
  },
];

if (countEdges(heroEdges) !== heroRun.topology.expectedNodeCount) {
  throw new Error('SaaS hero topology edge count does not match expectedNodeCount.');
}

if (countEdges(monsterEdges) !== monsterRun.topology.expectedNodeCount) {
  throw new Error('SaaS monster topology edge count does not match expectedNodeCount.');
}

export const saasScenario: DemoScenario = {
  vertical: 'saas',
  label: 'SaaS',
  description: 'A multi-agent SaaS operations environment covering API traffic, content safety, incident response, recommendations, and billing intelligence.',
  agentNodes,
  heroRun,
  monsterRun,
  runTemplates,
  accessPolicies,
  logTemplates,
};
