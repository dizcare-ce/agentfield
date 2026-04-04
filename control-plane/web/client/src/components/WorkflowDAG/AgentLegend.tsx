import {
  ChevronDown,
  ChevronUp,
  Filter,
  Maximize2,
  Search,
} from "@/components/ui/icon-bridge";
import type { Node } from "@xyflow/react";
import { useMemo, useState } from "react";
import { cn } from "../../lib/utils";
import { agentColorManager } from "../../utils/agentColorManager";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { AgentBadge, AgentColorDot } from "./AgentBadge";

interface WorkflowDAGNode {
  workflow_id: string;
  execution_id: string;
  agent_node_id: string;
  reasoner_id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  parent_workflow_id?: string;
  parent_execution_id?: string;
  workflow_depth: number;
  children: WorkflowDAGNode[];
  agent_name?: string;
  task_name?: string;
}

interface AgentLegendProps {
  className?: string;
  onAgentFilter?: (agentName: string | null) => void;
  selectedAgent?: string | null;
  compact?: boolean;
  nodes?: Node[];
  /** Opens the graph in full viewport (parent provides overlay chrome). */
  onExpandGraph?: () => void;
}

export function AgentLegend({
  className,
  onAgentFilter,
  selectedAgent,
  compact = false,
  nodes = [],
  onExpandGraph,
}: AgentLegendProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const workflowAgents = useMemo(() => {
    const agentSet = new Set<string>();

    nodes.forEach((node) => {
      const nodeData = node.data as unknown as WorkflowDAGNode;
      const agentName = nodeData.agent_name || nodeData.agent_node_id;
      if (agentName) {
        agentSet.add(agentName);
      }
    });

    return Array.from(agentSet);
  }, [nodes]);

  const agentColors = useMemo(() => {
    if (workflowAgents.length > 0) {
      agentColorManager.cleanupUnusedAgents(workflowAgents);
    }

    return workflowAgents.map((agentName) => {
      return agentColorManager.getAgentColor(agentName);
    });
  }, [workflowAgents]);

  const filteredAgents = agentColors.filter((agent) =>
    agent.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (agentColors.length === 0) {
    return null;
  }

  const expandButton =
    onExpandGraph != null ? (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={onExpandGraph}
        aria-label="Expand graph to full screen"
      >
        <Maximize2 className="size-4" />
      </Button>
    ) : null;

  const agentRow = (agent: (typeof agentColors)[0]) => (
    <button
      key={agent.name}
      type="button"
      onClick={() =>
        onAgentFilter?.(selectedAgent === agent.name ? null : agent.name)
      }
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors",
        "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selectedAgent === agent.name && "bg-accent text-accent-foreground",
      )}
    >
      <AgentBadge agentName={agent.name} size="sm" showTooltip={false} />
      <span className="min-w-0 flex-1 text-left text-sm font-medium leading-tight text-foreground truncate">
        {agent.name}
      </span>
      {selectedAgent === agent.name ? (
        <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      ) : (
        <span className="size-2 shrink-0" aria-hidden />
      )}
    </button>
  );

  if (compact || agentColors.length <= 6) {
    return (
      <Card
        className={cn(
          "w-[min(100%,280px)] min-w-[220px] border-border/80 bg-card/95 shadow-md backdrop-blur-sm",
          className,
        )}
      >
        <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border/60 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
            <Filter className="size-3.5 shrink-0 text-muted-foreground" />
            <CardTitle className="truncate text-center text-sm font-semibold leading-none text-foreground">
              Agents
            </CardTitle>
            <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-semibold tabular-nums">
              {agentColors.length}
            </Badge>
          </div>
          {expandButton}
        </CardHeader>
        <CardContent className="space-y-1 p-2">
          {agentColors.map((agent) => agentRow(agent))}
        </CardContent>
        {selectedAgent ? (
          <CardFooter className="flex flex-col border-t border-border/60 p-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onAgentFilter?.(null)}
            >
              Clear filter
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "w-[min(100%,320px)] min-w-[240px] max-w-[340px] border-border/80 bg-card/95 shadow-md backdrop-blur-sm",
        className,
      )}
    >
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border/60 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <Filter className="size-3.5 shrink-0 text-muted-foreground" />
          <CardTitle className="text-center text-sm font-semibold leading-none text-foreground">
            Agents
          </CardTitle>
          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-semibold tabular-nums">
            {agentColors.length}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse agent list" : "Expand agent list"}
          >
            {isExpanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
          {expandButton}
        </div>
      </CardHeader>

      {isExpanded ? (
        <>
          {agentColors.length > 6 ? (
            <>
              <div className="px-3 py-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search agents…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 border-border/60 bg-background/80 pl-8 text-xs"
                  />
                </div>
              </div>
              <Separator className="bg-border/60" />
            </>
          ) : null}

          <CardContent
            className={cn(
              "p-2",
              filteredAgents.length > 8 && "max-h-64 overflow-y-auto",
            )}
          >
            <div className="space-y-1">
              {filteredAgents.map((agent) => agentRow(agent))}
            </div>
            {filteredAgents.length === 0 && searchTerm ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                No agents match &ldquo;{searchTerm}&rdquo;
              </p>
            ) : null}
          </CardContent>

          {selectedAgent ? (
            <>
              <Separator className="bg-border/60" />
              <CardFooter className="p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => onAgentFilter?.(null)}
                >
                  Clear filter
                </Button>
              </CardFooter>
            </>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export function AgentLegendMini({
  className,
  onAgentFilter,
  selectedAgent,
  nodes = [],
}: AgentLegendProps) {
  const workflowAgents = useMemo(() => {
    const agentSet = new Set<string>();

    nodes.forEach((node) => {
      const nodeData = node.data as unknown as WorkflowDAGNode;
      const agentName = nodeData.agent_name || nodeData.agent_node_id;
      if (agentName) {
        agentSet.add(agentName);
      }
    });

    return Array.from(agentSet);
  }, [nodes]);

  const agentColors = useMemo(() => {
    if (workflowAgents.length > 0) {
      agentColorManager.cleanupUnusedAgents(workflowAgents);
    }

    return workflowAgents.map((agentName) => {
      return agentColorManager.getAgentColor(agentName);
    });
  }, [workflowAgents]);

  if (agentColors.length === 0) return null;

  return (
    <Card
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1.5 border-border/80 bg-card/95 px-2 py-1.5 shadow-sm backdrop-blur-sm",
        className,
      )}
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Agents
      </span>
      <Separator orientation="vertical" className="mx-0.5 h-4 bg-border/60" />
      <div className="flex flex-wrap items-center justify-center gap-1">
        {agentColors.slice(0, 8).map((agent) => (
          <button
            key={agent.name}
            type="button"
            onClick={() =>
              onAgentFilter?.(selectedAgent === agent.name ? null : agent.name)
            }
            className={cn(
              "rounded-full transition-transform duration-150",
              "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedAgent === agent.name && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
            title={agent.name}
          >
            <AgentColorDot
              agentName={agent.name}
              size={12}
              className={cn(
                selectedAgent === agent.name && "ring-2 ring-primary/40",
              )}
            />
          </button>
        ))}
        {agentColors.length > 8 ? (
          <Badge variant="outline" className="text-[10px]">
            +{agentColors.length - 8}
          </Badge>
        ) : null}
      </div>
    </Card>
  );
}
