import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRunDAG, useCancelExecution } from "@/hooks/queries";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BadgeCheck,
  ChevronDown,
  FileJson,
  FileCheck2,
  Info,
  Link2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RunTrace, buildTraceTree, formatDuration } from "@/components/RunTrace";
import { StepDetail } from "@/components/StepDetail";
import { WorkflowDAGViewer } from "@/components/WorkflowDAG";
import type {
  WebhookFailurePreview,
  WebhookRunSummary,
  WorkflowDAGLightweightNode,
  WorkflowDAGLightweightResponse,
} from "@/types/workflows";
import { retryExecutionWebhook } from "@/services/executionsApi";
import {
  downloadWorkflowVCAuditFile,
  getWorkflowVCChain,
} from "@/services/vcApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(
  status: string,
): "default" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "succeeded":
      return "default";
    case "failed":
    case "timeout":
      return "destructive";
    default:
      return "secondary";
  }
}

function computeMaxDuration(
  timeline: WorkflowDAGLightweightNode[],
): number {
  if (!timeline || timeline.length === 0) return 1;
  const max = Math.max(...timeline.map((n) => n.duration_ms ?? 0));
  return Math.max(max, 1);
}

/** Compact display for long session/actor strings in the meta row. */
function truncateEnd(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/** Show leading ellipsis + last `visible` chars so long IDs stay compact. */
function truncateIdTail(id: string, visible: number): string {
  const v = Math.max(1, visible);
  if (id.length <= v) return id;
  return `…${id.slice(-v)}`;
}

const RUN_DETAIL_TITLE_MAX_CHARS = 42;

/** Label + truncated id + copy — full value in clipboard and tooltips. */
function HeaderCopyChip({
  label,
  value,
  tooltip,
  noValueMessage,
  idTailVisible = 6,
}: {
  label: string;
  value: string | undefined;
  tooltip: string;
  noValueMessage?: string;
  /** How many characters of the id to show after the ellipsis (when truncated). */
  idTailVisible?: number;
}) {
  if (!value) {
    if (!noValueMessage) return null;
    return (
      <span
        className="text-[10px] text-muted-foreground/70"
        title="Verifiable credentials disabled or issuer DID not yet issued"
      >
        {noValueMessage}
      </span>
    );
  }
  const idDisplay = truncateIdTail(value, idTailVisible);
  return (
    <div
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/35 pl-2 pr-0.5",
        "text-[10px] text-muted-foreground",
      )}
      title={`${label}: ${value}`}
    >
      <span className="shrink-0 font-medium text-muted-foreground">{label}</span>
      <span
        className="min-w-0 truncate font-mono text-[10px] text-foreground/90"
        title={value}
      >
        {idDisplay}
      </span>
      <CopyButton
        value={value}
        tooltip={tooltip}
        copiedTooltip="Copied!"
        variant="ghost"
        size="icon"
        title={value}
        className="size-6 shrink-0 rounded-sm text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
      />
    </div>
  );
}

const ZERO_WEBHOOK_SUMMARY: WebhookRunSummary = {
  steps_with_webhook: 0,
  total_deliveries: 0,
  failed_deliveries: 0,
};

function RunContextHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground/45 transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={label}
        >
          <Info className="size-3" strokeWidth={2.25} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[min(18rem,calc(100vw-1.5rem))] border border-border bg-popover px-2.5 py-2 text-left text-[11px] leading-snug text-popover-foreground shadow-md"
      >
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

type RunParticipantsSource = "api_agent" | "timeline_agent" | "reasoner";

/** Distinct participant ids for the run: API rollup agent ids, else timeline agent_node_id, else reasoner_id. */
function deriveRunParticipants(dag: WorkflowDAGLightweightResponse): {
  ids: string[];
  source: RunParticipantsSource;
} {
  const api = (dag.unique_agent_node_ids ?? []).map((id) => id.trim()).filter(Boolean);
  if (api.length > 0) {
    return { ids: [...new Set(api)].sort(), source: "api_agent" };
  }
  const fromTimeline = new Set<string>();
  for (const n of dag.timeline ?? []) {
    const id = n.agent_node_id?.trim();
    if (id) fromTimeline.add(id);
  }
  if (fromTimeline.size > 0) {
    return { ids: [...fromTimeline].sort(), source: "timeline_agent" };
  }
  const reasoners = new Set<string>();
  for (const n of dag.timeline ?? []) {
    const id = n.reasoner_id?.trim();
    if (id) reasoners.add(id);
  }
  return { ids: [...reasoners].sort(), source: "reasoner" };
}

function RunContextNodesCard({
  participantIds,
  source,
}: {
  participantIds: string[];
  source: "api_agent" | "timeline_agent" | "reasoner";
}) {
  const hasIds = participantIds.length > 0;
  const heading = source === "reasoner" ? "Reasoners" : "Nodes";
  const hint =
    source === "reasoner"
      ? "These are distinct reasoner IDs from the run timeline. Stored executions had no agent_node_id, so the graph labels steps by reasoner — same data as the graph."
      : source === "timeline_agent"
        ? "Distinct agent node IDs taken from the run timeline (execution records had no agent_node_id in the roll-up field)."
        : "Distinct agent node IDs for this run from the server. Select a step for that step's payload and detail.";
  return (
    <Card
      className={cn(
        "min-w-0 border-border/80 shadow-none",
        !hasIds && "border-dashed border-border/50 bg-muted/15",
      )}
    >
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {heading}
          </p>
          <RunContextHint label={`About ${heading.toLowerCase()} on this run`}>
            {hint}
          </RunContextHint>
        </div>
        {hasIds ? (
          <div className="flex flex-wrap gap-1.5">
            {participantIds.map((id) => (
              <Badge
                key={id}
                variant="secondary"
                className="max-w-full truncate font-mono text-[10px] font-normal"
                title={id}
              >
                {id}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No agent or reasoner identifiers on this run.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Run-level webhook roll-up + failed rows with retry (like legacy workflow webhooks tab). */
function RunContextWebhooksCard({
  summary,
  failures,
  onSelectStep,
  onRefetchDag,
}: {
  summary: WebhookRunSummary;
  failures: WebhookFailurePreview[];
  onSelectStep: (executionId: string) => void;
  onRefetchDag: () => void;
}) {
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});
  const [retryAllBusy, setRetryAllBusy] = useState(false);
  const [retryErr, setRetryErr] = useState<string | null>(null);

  const steps = summary.steps_with_webhook;
  const total = summary.total_deliveries;
  const failed = summary.failed_deliveries;
  const succeeded = Math.max(0, total - failed);
  const empty = steps === 0 && total === 0;
  const pendingRegistrations = steps > 0 && total === 0;

  const runRetry = async (executionId: string) => {
    setRetryErr(null);
    setRetrying((r) => ({ ...r, [executionId]: true }));
    try {
      await retryExecutionWebhook(executionId);
      onRefetchDag();
    } catch (e) {
      setRetryErr(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying((r) => {
        const n = { ...r };
        delete n[executionId];
        return n;
      });
    }
  };

  const runRetryAll = async () => {
    if (failures.length === 0) return;
    setRetryErr(null);
    setRetryAllBusy(true);
    try {
      for (const f of failures) {
        await retryExecutionWebhook(f.execution_id);
      }
      onRefetchDag();
    } catch (e) {
      setRetryErr(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetryAllBusy(false);
    }
  };

  return (
    <Card
      className={cn(
        "min-w-0 border-border/80 shadow-none",
        empty && "border-dashed border-border/50 bg-muted/15",
      )}
    >
      <CardContent className={cn("p-3", empty && "py-2.5")}>
        <div className={cn("flex items-center gap-0.5", empty ? "mb-0.5" : "mb-1")}>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Webhooks
          </p>
          <RunContextHint label="About run-level webhook summary">
            Counts outbound HTTP callbacks registered on steps in this run and delivery
            attempts recorded by the control plane. Failed deliveries listed below can be
            retried here; full attempt history stays in the selected step panel.
          </RunContextHint>
        </div>

        {empty ? (
          <p className="text-[11px] leading-tight text-muted-foreground">
            No outbound webhooks—register a webhook URL on the reasoner to receive callbacks.
          </p>
        ) : pendingRegistrations ? (
          <p className="text-xs text-foreground">
            {steps} step{steps === 1 ? "" : "s"} registered for callbacks — no delivery
            attempts recorded yet.
          </p>
        ) : (
          <p className="text-xs text-foreground">
            {steps} step{steps === 1 ? "" : "s"} with callbacks · {total} delivery
            {total === 1 ? "" : "ies"}
            {succeeded > 0 ? ` · ${succeeded} succeeded` : ""}
            {failed > 0 ? ` · ${failed} failed` : ""}
          </p>
        )}

        {failures.length > 0 ? (
          <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Failed deliveries
              </p>
              {failures.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[10px]"
                  disabled={retryAllBusy}
                  onClick={() => void runRetryAll()}
                >
                  {retryAllBusy ? (
                    <RefreshCw className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  Retry all
                </Button>
              ) : null}
            </div>
            <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
              {failures.map((f) => {
                const label =
                  f.reasoner_id?.trim() ||
                  f.agent_node_id?.trim() ||
                  f.execution_id.slice(0, 12);
                const busy = Boolean(retrying[f.execution_id]);
                return (
                  <li
                    key={f.execution_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground" title={label}>
                        {label}
                      </p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">
                        {f.event_type}
                        {f.http_status != null ? ` · HTTP ${f.http_status}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => onSelectStep(f.execution_id)}
                      >
                        Step
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-6 gap-1 px-2 text-[10px]"
                        disabled={busy}
                        onClick={() => void runRetry(f.execution_id)}
                      >
                        {busy ? (
                          <RefreshCw className="size-3 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3" />
                        )}
                        Retry
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {retryErr ? (
          <p className="mt-1.5 text-[10px] text-destructive">{retryErr}</p>
        ) : null}

        {!empty ? (
          <p
            className={cn(
              "mt-1.5 text-[10px] leading-snug text-muted-foreground",
              failures.length === 0 && "opacity-80",
            )}
          >
            {failures.length === 0
              ? "Select a step to see each delivery attempt, HTTP status, and retry failed sends."
              : "Use Step to open the execution in the detail panel, or Retry to resend from the control plane."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: dag, isLoading, isError, error } = useRunDAG(runId);
  const cancelMutation = useCancelExecution();

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"trace" | "graph">("trace");

  const participants = useMemo(() => {
    if (!dag) {
      return { ids: [] as string[], source: "api_agent" as const };
    }
    return deriveRunParticipants(dag);
  }, [dag]);

  const workflowIdForVc = dag?.root_workflow_id || runId || "";
  const { data: vcChain } = useQuery({
    queryKey: ["workflow-vc-chain", workflowIdForVc],
    queryFn: () => getWorkflowVCChain(workflowIdForVc),
    enabled: Boolean(workflowIdForVc),
    retry: false,
    staleTime: 60_000,
  });

  // Auto-select root step (first in timeline)
  useEffect(() => {
    if (dag?.timeline && dag.timeline.length > 0 && !selectedStepId) {
      const root =
        dag.timeline.find((n) => n.workflow_depth === 0) ?? dag.timeline[0];
      setSelectedStepId(root.execution_id);
    }
  }, [dag, selectedStepId]);

  const traceTree = useMemo(() => {
    if (!dag?.timeline) return null;
    return buildTraceTree(dag.timeline);
  }, [dag]);

  const maxDuration = useMemo(
    () => computeMaxDuration(dag?.timeline ?? []),
    [dag],
  );

  const isSingleStep = (dag?.total_nodes ?? 0) <= 1;
  const shortId = runId ? runId.substring(0, 12) : "—";

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-4 h-[calc(100vh-8rem)]">
        <div className="flex flex-shrink-0 flex-col gap-2 border-b border-border/50 pb-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-7 w-36 sm:h-8 sm:w-48" />
              <Skeleton className="h-7 w-[5.5rem] rounded-md" />
              <Skeleton className="h-7 w-[6.5rem] rounded-md" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Skeleton className="h-8 w-[4.5rem]" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Run {shortId}
        </h1>
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load run"}
        </div>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────
  if (!dag) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Run {shortId}
        </h1>
        <p className="text-sm text-muted-foreground">No data available for this run.</p>
      </div>
    );
  }

  const rootNode = dag.timeline.find((n) => n.workflow_depth === 0) ?? dag.timeline[0];

  const workflowId = dag.root_workflow_id || runId || "";

  const serverWorkflowIssuerDid =
    dag.workflow_issuer_did?.trim() ||
    vcChain?.workflow_vc?.issuer_did?.trim() ||
    "";

  const runTitle =
    dag.workflow_name?.trim() ||
    rootNode?.reasoner_id ||
    "Run";
  const runTitleDisplay = truncateEnd(runTitle, RUN_DETAIL_TITLE_MAX_CHARS);

  const metaParts: string[] = [];
  if (dag.workflow_name?.trim() && rootNode?.reasoner_id) {
    metaParts.push(rootNode.reasoner_id);
  }
  metaParts.push(
    `${dag.total_nodes} ${dag.total_nodes === 1 ? "step" : "steps"}`,
  );
  if (rootNode?.duration_ms != null) {
    metaParts.push(formatDuration(rootNode.duration_ms));
  }
  if (dag.max_depth > 0) {
    metaParts.push(`Depth ${dag.max_depth}`);
  }

  const sessionTrim = dag.session_id?.trim();
  const actorTrim = dag.actor_id?.trim();

  return (
    <div className="flex min-w-0 flex-col h-[calc(100vh-8rem)] max-w-full">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-3 flex min-w-0 flex-shrink-0 flex-col gap-2 border-b border-border/50 pb-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <h1
              className="min-w-0 text-lg font-semibold tracking-tight text-foreground sm:text-xl"
              title={runTitle !== runTitleDisplay ? runTitle : undefined}
            >
              {runTitleDisplay}
            </h1>
            {runId ? (
              <HeaderCopyChip
                label="Run"
                value={runId}
                tooltip="Copy run ID"
                idTailVisible={6}
              />
            ) : null}
            <HeaderCopyChip
              label="Identity"
              value={serverWorkflowIssuerDid}
              tooltip="Copy workflow issuer DID"
              noValueMessage="No issuer DID"
              idTailVisible={8}
            />
            <Badge
              variant={statusVariant(dag.workflow_status)}
              className="h-5 shrink-0 px-1.5 py-0 text-[10px] font-medium capitalize leading-none"
            >
              {dag.workflow_status}
            </Badge>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <p className="m-0 min-w-0 flex-1 text-xs leading-snug text-muted-foreground">
              <span>{metaParts.join(" · ")}</span>
              {sessionTrim ? (
                <>
                  {" · "}
                  <span
                    className="font-mono text-[11px] text-muted-foreground/90"
                    title={sessionTrim}
                  >
                    Session {truncateEnd(sessionTrim, 28)}
                  </span>
                </>
              ) : null}
              {actorTrim ? (
                <>
                  {" · "}
                  <span
                    className="font-mono text-[11px] text-muted-foreground/90"
                    title={actorTrim}
                  >
                    Actor {truncateEnd(actorTrim, 24)}
                  </span>
                </>
              ) : null}
            </p>

            {workflowId && workflowId !== runId ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:shrink-0">
                <HeaderCopyChip
                  label="Flow"
                  value={workflowId}
                  tooltip="Copy workflow ID"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:pt-0.5 sm:justify-end">
          {/* Replay */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              const agentNodeId = rootNode?.agent_node_id;
              const reasonerId = rootNode?.reasoner_id;
              const target =
                agentNodeId && reasonerId
                  ? `${agentNodeId}.${reasonerId}`
                  : agentNodeId ?? reasonerId ?? "";
              navigate(`/playground${target ? `/${target}` : ""}`);
            }}
          >
            <RotateCcw className="size-3.5 mr-1" />
            Replay
          </Button>

          {/* Export run provenance (VC chain + audit bundle) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-3 shadow-sm"
                aria-label="Export provenance: verifiable credential chain or audit JSON for this run"
              >
                <BadgeCheck
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="text-xs font-medium">Export provenance</span>
                <ChevronDown
                  className="size-3.5 shrink-0 opacity-60"
                  aria-hidden
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Provenance for this run
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                onClick={() => {
                  void (async () => {
                    try {
                      const data = await getWorkflowVCChain(workflowId);
                      const blob = new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      window.open(url, "_blank", "noopener,noreferrer");
                      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                    } catch (e) {
                      console.error(e);
                    }
                  })();
                }}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="size-4 shrink-0" />
                  Preview VC chain
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  Authenticated fetch — JSON in a new tab
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                onClick={() => {
                  void downloadWorkflowVCAuditFile(workflowId).catch((e) =>
                    console.error(e),
                  );
                }}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileJson className="size-4 shrink-0" />
                  Download VC audit JSON
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  Same shape as GET /workflows/…/vc-chain — use with{" "}
                  <code className="text-[10px]">af verify</code>
                </span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  to="/verify"
                  className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileCheck2 className="size-4 shrink-0" />
                    Open Audit tool
                  </span>
                  <span className="pl-6 text-xs text-muted-foreground">
                    Upload the file you downloaded for cryptographic checks
                  </span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Cancel (running only) */}
          {dag.workflow_status === "running" && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs"
              disabled={cancelMutation.isPending}
              onClick={() => {
                const execId =
                  dag.timeline.find((n) => n.workflow_depth === 0)
                    ?.execution_id ?? dag.timeline[0]?.execution_id;
                if (execId) cancelMutation.mutate(execId);
              }}
            >
              Cancel
            </Button>
          )}

        </div>
      </div>

      {/* Nodes + webhooks — always show run-level strip (empty states explicit) */}
      <TooltipProvider delayDuration={280}>
        <div className="mb-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <RunContextNodesCard
            participantIds={participants.ids}
            source={participants.source}
          />
          <RunContextWebhooksCard
            summary={dag.webhook_summary ?? ZERO_WEBHOOK_SUMMARY}
            failures={dag.webhook_failures ?? []}
            onSelectStep={setSelectedStepId}
            onRefetchDag={() => {
              void queryClient.invalidateQueries({ queryKey: ["run-dag", runId] });
              void queryClient.invalidateQueries({ queryKey: ["step-detail"] });
            }}
          />
        </div>
      </TooltipProvider>

      {/* ─── Content ────────────────────────────────────────────────────── */}
      {isSingleStep ? (
        // Single-step run: show step detail directly, fill remaining height
        <Card className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0 min-w-0">
            {selectedStepId ? (
              <StepDetail executionId={selectedStepId} />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                No step selected
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Multi-step run: flex split — grid auto-rows were collapsing h-full for React Flow on small screens
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch">
          {/* Left: trace or graph panel */}
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-w-0 lg:basis-0">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">
                Steps
              </span>
              <Tabs
                value={viewMode}
                onValueChange={(v) => setViewMode(v as "trace" | "graph")}
              >
                <TabsList className="h-8" aria-label="Trace or graph view">
                  <TabsTrigger value="trace" className="h-7 px-3 text-xs">
                    Trace
                  </TabsTrigger>
                  <TabsTrigger value="graph" className="h-7 px-3 text-xs">
                    Graph
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-0">
              {viewMode === "graph" ? (
                <div
                  className="flex h-full min-h-[min(45vh,22rem)] min-w-0 flex-1 flex-col"
                  style={{
                    minHeight: "max(280px, min(45vh, 22rem))",
                    width: "100%",
                    flex: "1 1 0%",
                  }}
                >
                  <WorkflowDAGViewer
                    key={runId}
                    className="h-full min-h-0 flex-1"
                    workflowId={dag.root_workflow_id || runId || ""}
                    dagData={dag}
                    selectedNodeIds={selectedStepId ? [selectedStepId] : undefined}
                    onExecutionClick={(execution) =>
                      setSelectedStepId(execution.execution_id)
                    }
                  />
                </div>
              ) : (
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                  {traceTree ? (
                    <RunTrace
                      node={traceTree}
                      maxDuration={maxDuration}
                      selectedId={selectedStepId}
                      onSelect={setSelectedStepId}
                      runStartedAt={
                        dag.timeline.find((n) => n.workflow_depth === 0)
                          ?.started_at ??
                        dag.timeline[0]?.started_at ??
                        ""
                      }
                    />
                  ) : (
                    <p className="p-4 text-xs text-muted-foreground">
                      No steps to display
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: step detail panel */}
          <Card className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:min-w-0 lg:basis-0">
            <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col p-0">
              {selectedStepId ? (
                <StepDetail executionId={selectedStepId} />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  Select a step to view details
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
