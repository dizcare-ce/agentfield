import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle, Clock, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

import { useRuns } from "@/hooks/queries";
import { useLLMHealth, useQueueStatus } from "@/hooks/queries";
import { useAgents } from "@/hooks/queries";
import { getDashboardSummary } from "@/services/dashboardService";
import { getStatusTheme } from "@/utils/status";
import type { WorkflowSummary } from "@/types/workflows";
import type { AgentNodeSummary } from "@/types/agentfield";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number | undefined): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms}ms`;
  const secs = ms / 1_000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const rem = Math.round(secs % 60);
  return `${mins}m ${rem}s`;
}

function formatRelative(isoString: string | undefined): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── stat card ──────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  loading?: boolean;
}

function StatCard({ label, value, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-semibold tabular-nums">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── run status badge ────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  const theme = getStatusTheme(status);

  const variantMap: Record<string, "success" | "failed" | "running" | "pending" | "unknown"> = {
    succeeded: "success",
    failed: "failed",
    running: "running",
    pending: "pending",
    queued: "pending",
    waiting: "pending",
    paused: "pending",
    cancelled: "unknown",
    timeout: "failed",
    unknown: "unknown",
  };

  const badgeVariant = variantMap[theme.status] ?? "unknown";

  const labelMap: Record<string, string> = {
    succeeded: "ok",
    failed: "fail",
    running: "running",
    pending: "pending",
    queued: "queued",
    waiting: "waiting",
    paused: "paused",
    cancelled: "cancelled",
    timeout: "timeout",
    unknown: "unknown",
  };

  return (
    <Badge variant={badgeVariant} size="sm">
      {labelMap[theme.status] ?? theme.status}
    </Badge>
  );
}

// ─── issues banner ───────────────────────────────────────────────────────────

interface IssuesBannerProps {
  llmHealthLoading: boolean;
  unhealthyEndpoints: string[];
  queueOverloaded: boolean;
  overloadedAgents: string[];
}

function IssuesBanner({
  llmHealthLoading,
  unhealthyEndpoints,
  queueOverloaded,
  overloadedAgents,
}: IssuesBannerProps) {
  if (llmHealthLoading) return null;

  const issues: string[] = [];

  if (unhealthyEndpoints.length > 0) {
    const label =
      unhealthyEndpoints.length === 1
        ? `LLM circuit OPEN on endpoint: ${unhealthyEndpoints[0]}`
        : `LLM circuit OPEN on ${unhealthyEndpoints.length} endpoints: ${unhealthyEndpoints.join(", ")}`;
    issues.push(label);
  }

  if (queueOverloaded && overloadedAgents.length > 0) {
    issues.push(
      `Queue at capacity for agent${overloadedAgents.length > 1 ? "s" : ""}: ${overloadedAgents.join(", ")}`
    );
  }

  if (issues.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>System Issues</AlertTitle>
      <AlertDescription className="mt-1 space-y-0.5">
        {issues.map((issue, i) => (
          <div key={i}>{issue}</div>
        ))}
      </AlertDescription>
    </Alert>
  );
}

// ─── recent runs table ───────────────────────────────────────────────────────

interface RecentRunsTableProps {
  runs: WorkflowSummary[];
  loading: boolean;
  onRowClick: (runId: string) => void;
}

function RecentRunsTable({ runs, loading, onRowClick }: RecentRunsTableProps) {
  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CheckCircle className="size-8 mb-2 opacity-40" />
        <p className="text-sm">No runs yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-[110px]">Run</TableHead>
          <TableHead>Reasoner</TableHead>
          <TableHead className="w-[60px] text-right">Steps</TableHead>
          <TableHead className="w-[100px]">Status</TableHead>
          <TableHead className="w-[80px] text-right">Duration</TableHead>
          <TableHead className="w-[90px] text-right">Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow
            key={run.run_id}
            className="cursor-pointer"
            onClick={() => onRowClick(run.run_id)}
          >
            <TableCell className="font-mono text-xs text-muted-foreground">
              {run.run_id.slice(0, 8)}
            </TableCell>
            <TableCell className="max-w-[200px] truncate text-sm font-medium">
              {run.root_reasoner || run.display_name || "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums text-sm">
              {run.total_executions ?? "—"}
            </TableCell>
            <TableCell>
              <RunStatusBadge status={run.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
              {formatDuration(run.duration_ms)}
            </TableCell>
            <TableCell className="text-right text-xs text-muted-foreground">
              {formatRelative(run.started_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export function NewDashboardPage() {
  const navigate = useNavigate();

  // Data queries
  const runsQuery = useRuns({ pageSize: 10, sortBy: "latest_activity", sortOrder: "desc" });
  const llmHealthQuery = useLLMHealth();
  const queueQuery = useQueueStatus();
  const agentsQuery = useAgents();

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    refetchInterval: 30_000,
  });

  // Derive issues
  const unhealthyEndpoints =
    llmHealthQuery.data?.endpoints
      ?.filter((ep) => !ep.healthy)
      .map((ep) => ep.name) ?? [];

  const overloadedAgents = Object.entries(queueQuery.data?.agents ?? {})
    .filter(([, s]) => s.running >= s.max_concurrent && s.max_concurrent > 0)
    .map(([name]) => name);

  const hasIssues = unhealthyEndpoints.length > 0 || overloadedAgents.length > 0;

  // Stat values
  const totalRuns = summaryQuery.data?.executions?.today ?? runsQuery.data?.total_count;
  const successRate = summaryQuery.data?.success_rate;
  const agentsOnline =
    agentsQuery.data?.nodes?.filter(
      (n: AgentNodeSummary) => n.health_status === "ready" || n.health_status === "active"
    ).length ??
    agentsQuery.data?.count ??
    summaryQuery.data?.agents?.running;

  // Average duration across recent runs
  const recentRuns = runsQuery.data?.workflows ?? [];
  const avgDuration = (() => {
    const completed = recentRuns.filter((r) => r.duration_ms != null);
    if (completed.length === 0) return null;
    const avg = completed.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0) / completed.length;
    return formatDuration(avg);
  })();

  return (
    <div className="flex flex-col gap-6 p-6 max-w-screen-xl mx-auto">
      {/* Issues banner — only renders when something is wrong */}
      {hasIssues && (
        <IssuesBanner
          llmHealthLoading={llmHealthQuery.isLoading}
          unhealthyEndpoints={unhealthyEndpoints}
          queueOverloaded={overloadedAgents.length > 0}
          overloadedAgents={overloadedAgents}
        />
      )}

      {/* Recent Runs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Recent Runs</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/workflows")}
          >
            View All
            <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <RecentRunsTable
            runs={recentRuns.slice(0, 10)}
            loading={runsQuery.isLoading}
            onRowClick={(runId) => {
              const run = recentRuns.find((r) => r.run_id === runId);
              navigate(`/workflows/${run?.workflow_id ?? runId}`);
            }}
          />
        </CardContent>
      </Card>

      {/* System Overview — 4 stat cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          System Overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total Runs Today"
            value={totalRuns ?? "—"}
            loading={summaryQuery.isLoading && runsQuery.isLoading}
          />
          <StatCard
            label="Success Rate"
            value={
              successRate != null
                ? `${(successRate * 100).toFixed(1)}%`
                : "—"
            }
            loading={summaryQuery.isLoading}
          />
          <StatCard
            label="Agents Online"
            value={agentsOnline ?? "—"}
            loading={agentsQuery.isLoading && summaryQuery.isLoading}
          />
          <StatCard
            label="Avg Run Time"
            value={avgDuration ?? "—"}
            loading={runsQuery.isLoading}
          />
        </div>
      </div>
    </div>
  );
}
