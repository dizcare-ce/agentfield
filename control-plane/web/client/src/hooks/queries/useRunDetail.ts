import { useQuery } from "@tanstack/react-query";
import { getWorkflowDAGLightweight } from "../../services/workflowsApi";
import { getExecutionDetails } from "../../services/executionsApi";
import type { WorkflowDAGLightweightResponse } from "../../types/workflows";
import type { WorkflowExecution } from "../../types/executions";
import { normalizeExecutionStatus } from "../../utils/status";
import { useSSESync } from "../useSSEQuerySync";
import { useDemoMode } from "../../demo/hooks/useDemoMode";
import { getDemoRunDAG } from "../../demo/mock/interceptor";

export function useRunDAG(runId: string | undefined) {
  const { execConnected } = useSSESync();
  const { isDemoMode, vertical } = useDemoMode();
  return useQuery<WorkflowDAGLightweightResponse>({
    queryKey: ["run-dag", runId, isDemoMode ? "demo" : "live"],
    queryFn: isDemoMode && vertical && runId
      ? () => Promise.resolve(getDemoRunDAG(vertical, runId))
      : () => getWorkflowDAGLightweight(runId!),
    enabled: !!runId,
    staleTime: isDemoMode ? Infinity : undefined,
    refetchInterval: isDemoMode ? false : (query) => {
      const status = query.state.data?.workflow_status;
      if (status === "running" || status === "pending") {
        return execConnected ? 2_500 : 1_500;
      }
      return false;
    },
  });
}

export function useStepDetail(executionId: string | undefined) {
  const { execConnected } = useSSESync();
  return useQuery<WorkflowExecution>({
    queryKey: ["step-detail", executionId],
    queryFn: () => getExecutionDetails(executionId!),
    enabled: !!executionId,
    refetchInterval: (query) => {
      const st = normalizeExecutionStatus(query.state.data?.status);
      const active =
        st === "running" ||
        st === "pending" ||
        st === "queued" ||
        st === "waiting";
      if (!active) return false;
      return execConnected ? 2_500 : 1_500;
    },
  });
}
