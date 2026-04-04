import { Activity, Bot, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useLLMHealth, useQueueStatus, useAgents } from "@/hooks/queries";
import type { AgentNodeSummary } from "@/types/agentfield";

export function HealthStrip() {
  const llmHealth = useLLMHealth();
  const queueStatus = useQueueStatus();
  const agents = useAgents();

  // LLM status
  const llmOk = llmHealth.data
    ? !llmHealth.data.endpoints?.some((ep) => !ep.healthy)
    : true;

  // Agent count
  const nodes: AgentNodeSummary[] = agents.data?.nodes ?? [];
  const totalAgents = agents.data?.count ?? nodes.length;
  const onlineCount = nodes.filter(
    (n) =>
      n.health_status === "ready" ||
      n.health_status === "active" ||
      n.lifecycle_status === "running",
  ).length;

  // Queue
  const totalRunning = Object.values(queueStatus.data?.agents ?? {}).reduce(
    (sum, a) => sum + (a.running || 0),
    0,
  );

  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Activity
                className={`size-3.5 ${llmOk ? "text-green-500" : "text-destructive"}`}
              />
              <span className="text-muted-foreground">LLM</span>
              <Badge
                variant={llmOk ? "secondary" : "destructive"}
                className="h-5 px-1.5 text-[10px]"
              >
                {llmOk ? "Healthy" : "Degraded"}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {llmOk
              ? "All LLM endpoints responding"
              : "One or more LLM endpoints are unhealthy"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Bot
                className={`size-3.5 ${onlineCount > 0 ? "text-green-500" : "text-muted-foreground"}`}
              />
              <span className="text-muted-foreground">Agents</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {onlineCount}/{totalAgents} online
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>Agent fleet status</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Layers
                className={`size-3.5 ${totalRunning > 0 ? "text-blue-500" : "text-muted-foreground"}`}
              />
              <span className="text-muted-foreground">Queue</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {totalRunning} running
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>Execution queue status</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
