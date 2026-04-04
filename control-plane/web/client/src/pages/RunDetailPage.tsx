import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  Copy,
  FileJson,
  Link2,
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
import { RunTrace, buildTraceTree, formatDuration } from "@/components/RunTrace";
import { StepDetail } from "@/components/StepDetail";
import { WorkflowDAGViewer } from "@/components/WorkflowDAG";
import type { WorkflowDAGLightweightNode } from "@/types/workflows";

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

// ─── Main page ────────────────────────────────────────────────────────────────

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { data: dag, isLoading, isError, error } = useRunDAG(runId);
  const cancelMutation = useCancelExecution();

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"trace" | "graph">("trace");

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
      <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col gap-4">
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
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Run {shortId}
        </h1>
        <p className="text-sm text-muted-foreground">No data available for this run.</p>
      </div>
    );
  }

  const rootNode = dag.timeline.find((n) => n.workflow_depth === 0) ?? dag.timeline[0];

  function handleExportAudit() {
    const auditData = {
      run_id: runId,
      dag,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(auditData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runId?.slice(0, 12)}-audit.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-shrink-0 mb-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">
              Run{" "}
              <span className="font-mono text-muted-foreground">
                {runId?.slice(0, 16)}
              </span>
            </h1>
            <Badge variant={statusVariant(dag.workflow_status)}>
              {dag.workflow_status}
            </Badge>
            {/* DID badge */}
            <span
              className="text-[10px] font-mono text-muted-foreground/50 select-all"
              title={`Run DID: did:web:agentfield:run:${runId}`}
            >
              did:…{runId?.slice(-6)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dag.workflow_name || rootNode?.reasoner_id || "—"}
            {" · "}
            {dag.total_nodes} {dag.total_nodes === 1 ? "step" : "steps"}
            {rootNode?.duration_ms != null && (
              <> · {formatDuration(rootNode.duration_ms)}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Replay */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              const agentNodeId = (dag as any).dag?.agent_node_id ?? rootNode?.agent_node_id;
              const reasonerId = (dag as any).dag?.reasoner_id ?? rootNode?.reasoner_id;
              const target = agentNodeId && reasonerId
                ? `${agentNodeId}.${reasonerId}`
                : agentNodeId ?? reasonerId ?? "";
              navigate(`/playground${target ? `/${target}` : ""}`);
            }}
          >
            <RotateCcw className="size-3 mr-1" />
            Replay
          </Button>

          {/* Copy Run ID */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => runId && navigator.clipboard.writeText(runId)}
          >
            <Copy className="size-3 mr-1" />
            Copy ID
          </Button>

          {/* Export run provenance (VC chain + audit bundle) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-auto min-h-7 gap-2 py-1 px-2.5 text-left shadow-none"
                aria-label="Export this run: verifiable credential chain or audit JSON"
              >
                <BadgeCheck
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="text-xs font-medium leading-none">
                    Export run
                  </span>
                  <span className="text-[10px] font-normal leading-tight text-muted-foreground">
                    VC chain & audit
                  </span>
                </span>
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
                onClick={() =>
                  window.open(`/api/v1/did/workflow/${runId}/vc-chain`, "_blank")
                }
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="size-4 shrink-0" />
                  VC credential chain
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  Open the W3C VC chain in a new tab
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="flex cursor-pointer flex-col items-start gap-0.5 py-2"
                onClick={handleExportAudit}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <FileJson className="size-4 shrink-0" />
                  Audit bundle (JSON)
                </span>
                <span className="pl-6 text-xs text-muted-foreground">
                  DAG, run id, and export timestamp
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Cancel (running only) */}
          {dag.workflow_status === "running" && (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              disabled={cancelMutation.isPending}
              onClick={() => {
                const execId =
                  (dag as any).dag?.execution_id ??
                  dag.timeline[0]?.execution_id;
                if (execId) cancelMutation.mutate(execId);
              }}
            >
              Cancel
            </Button>
          )}

          {/* Trace / Graph toggle */}
          {!isSingleStep && (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "trace" | "graph")}>
              <TabsList className="h-7">
                <TabsTrigger value="trace" className="text-xs px-2.5 h-6">Trace</TabsTrigger>
                <TabsTrigger value="graph" className="text-xs px-2.5 h-6">Graph</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {/* ─── Content ────────────────────────────────────────────────────── */}
      {isSingleStep ? (
        // Single-step run: show step detail directly, fill remaining height
        <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <CardContent className="p-0 flex-1 min-h-0">
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
        // Multi-step run: split view fills remaining height
        <div className="grid grid-cols-[1fr_1fr] gap-4 flex-1 min-h-0">
          {/* Left: trace or graph panel */}
          <Card className="overflow-hidden flex flex-col">
            <CardContent className="p-0 flex-1 min-h-0 flex flex-col">
              {viewMode === "graph" ? (
                <div className="flex-1 min-h-0">
                  <WorkflowDAGViewer
                    workflowId={dag.root_workflow_id}
                    dagData={dag}
                    selectedNodeIds={selectedStepId ? [selectedStepId] : undefined}
                    onExecutionClick={(execution) => setSelectedStepId(execution.execution_id)}
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden">
                    {traceTree ? (
                      <RunTrace
                        node={traceTree}
                        maxDuration={maxDuration}
                        selectedId={selectedStepId}
                        onSelect={setSelectedStepId}
                        runStartedAt={dag?.dag?.started_at ?? ""}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground p-4">
                        No steps to display
                      </p>
                    )}
                  </div>
              )}
            </CardContent>
          </Card>

          {/* Right: step detail panel */}
          <Card className="overflow-hidden flex flex-col">
            <CardContent className="p-0 flex-1 min-h-0">
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
