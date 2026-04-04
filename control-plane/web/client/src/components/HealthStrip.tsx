import { Activity, Bot, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useLLMHealth, useQueueStatus, useAgents } from "@/hooks/queries";
import { useSSE } from "@/hooks/useSSE";
import { cn } from "@/lib/utils";
import type { AgentNodeSummary } from "@/types/agentfield";

type HealthStripProps = {
  className?: string;
};

export function HealthStrip({ className }: HealthStripProps) {
  const llmHealth = useLLMHealth();
  const queueStatus = useQueueStatus();
  const agents = useAgents();

  // SSE connection status (execution channel is the primary indicator)
  const { connected: sseConnected, reconnecting: sseReconnecting } = useSSE(
    "/api/ui/v1/executions/events",
    { autoReconnect: true, maxReconnectAttempts: 10, reconnectDelayMs: 2000, exponentialBackoff: true },
  );

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
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex items-center gap-2 text-xs sm:gap-3",
          className,
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Activity
                className={cn(
                  "size-3.5 shrink-0",
                  llmOk ? "text-green-500" : "text-destructive",
                )}
              />
              <span className="hidden text-muted-foreground lg:inline">
                LLM
              </span>
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
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Bot
                className={cn(
                  "size-3.5 shrink-0",
                  onlineCount > 0 ? "text-green-500" : "text-muted-foreground",
                )}
              />
              <span className="hidden text-muted-foreground lg:inline">
                Agents
              </span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {onlineCount}/{totalAgents} online
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>Agent fleet status</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Layers
                className={cn(
                  "size-3.5 shrink-0",
                  totalRunning > 0 ? "text-blue-500" : "text-muted-foreground",
                )}
              />
              <span className="hidden text-muted-foreground lg:inline">
                Queue
              </span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {totalRunning} running
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>Execution queue status</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 sm:gap-1.5">
              <div
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  sseConnected
                    ? "bg-green-500"
                    : sseReconnecting
                      ? "animate-pulse bg-amber-500"
                      : "bg-muted-foreground",
                )}
              />
              <span className="hidden text-[10px] text-muted-foreground sm:inline">
                {sseConnected
                  ? "Live"
                  : sseReconnecting
                    ? "Reconnecting"
                    : "Disconnected"}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {sseConnected
              ? "Real-time updates active"
              : sseReconnecting
                ? "Attempting to restore live updates"
                : "Live updates unavailable — pages will not auto-refresh"}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
