import { useQuery } from "@tanstack/react-query";
import { getNodesSummary } from "../../services/api";
import type { AgentNodeSummary } from "../../types/agentfield";
import { useSSESync } from "../useSSEQuerySync";
import { useDemoMode } from "../../demo/hooks/useDemoMode";
import { getDemoAgentNodes } from "../../demo/mock/interceptor";

interface NodesSummaryResponse {
  nodes: AgentNodeSummary[];
  count: number;
}

export function useAgents() {
  const { nodeConnected } = useSSESync();
  const { isDemoMode, vertical } = useDemoMode();
  return useQuery<NodesSummaryResponse>({
    queryKey: ["agents", isDemoMode ? "demo" : "live"],
    queryFn: isDemoMode && vertical
      ? () => {
          const nodes = getDemoAgentNodes(vertical);
          return Promise.resolve({ nodes, count: nodes.length });
        }
      : () => getNodesSummary(),
    refetchInterval: isDemoMode ? false : (nodeConnected ? 10_000 : 5_000),
    staleTime: isDemoMode ? Infinity : undefined,
  });
}
