import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useRunDAG, useCancelExecution } from "@/hooks/queries";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  const { data: dag, isLoading, isError, error } = useRunDAG(runId);
  const cancelMutation = useCancelExecution();

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-[500px] w-full" />
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

  return (
    <div className="flex flex-col gap-4">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Run{" "}
            <span className="font-mono text-muted-foreground">
              {shortId}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dag.workflow_name || rootNode?.reasoner_id || "—"}
            {" · "}
            {dag.total_nodes} {dag.total_nodes === 1 ? "step" : "steps"}
            {rootNode?.duration_ms != null && (
              <> · {formatDuration(rootNode.duration_ms)}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isSingleStep && (
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "trace" | "graph")}>
              <TabsList className="h-7">
                <TabsTrigger value="trace" className="text-xs px-2.5 h-6">Trace</TabsTrigger>
                <TabsTrigger value="graph" className="text-xs px-2.5 h-6">Graph</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Badge variant={statusVariant(dag.workflow_status)}>
            {dag.workflow_status}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.open(`/api/v1/did/workflow/${runId}/vc-chain`, "_blank");
            }}
          >
            <Download className="size-3.5 mr-1.5" />
            Export VC
          </Button>

          {dag.workflow_status === "running" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={cancelMutation.isPending}
              onClick={() => {
                const execId =
                  (dag as any).dag?.execution_id ??
                  dag.timeline[0]?.execution_id;
                if (execId) cancelMutation.mutate(execId);
              }}
            >
              Cancel Run
            </Button>
          )}

          {(dag.workflow_status === "failed" || dag.workflow_status === "timeout") && (
            <Button
              variant="outline"
              size="sm"
              disabled={replaying}
              onClick={() => setReplaying(true)}
            >
              Replay
            </Button>
          )}
        </div>
      </div>

      {/* ─── Content ────────────────────────────────────────────────────── */}
      {isSingleStep ? (
        // Single-step run: show step detail directly
        <Card>
          <CardContent className="p-0 min-h-[400px]">
            {selectedStepId ? (
              <StepDetail executionId={selectedStepId} />
            ) : (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                No step selected
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        // Multi-step run: split view
        <div className="grid grid-cols-[1fr_1fr] gap-4 min-h-[500px]">
          {/* Left: trace or graph panel */}
          <Card>
            <CardContent className="p-0">
              {viewMode === "graph" ? (
                <div className="h-[500px]">
                  <WorkflowDAGViewer
                    workflowId={dag.root_workflow_id}
                    dagData={dag}
                    selectedNodeIds={selectedStepId ? [selectedStepId] : undefined}
                    onExecutionClick={(execution) => setSelectedStepId(execution.execution_id)}
                  />
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="p-2">
                    {traceTree ? (
                      <RunTrace
                        node={traceTree}
                        maxDuration={maxDuration}
                        selectedId={selectedStepId}
                        onSelect={setSelectedStepId}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground p-4">
                        No steps to display
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Right: step detail panel */}
          <Card>
            <CardContent className="p-0 h-[500px]">
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
