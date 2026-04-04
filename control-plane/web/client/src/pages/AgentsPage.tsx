import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/hooks/queries";
import { getNodeDetails } from "@/services/api";
import { startAgent } from "@/services/configurationApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  RefreshCw,
  Play,
} from "@/components/ui/icon-bridge";
import type { AgentNodeSummary, ReasonerDefinition, SkillDefinition, LifecycleStatus } from "@/types/agentfield";
import { useQuery } from "@tanstack/react-query";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return "unknown";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return "just now";
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

type StatusVariant = "success" | "destructive" | "pending" | "secondary" | "default";

function getStatusVariant(
  lifecycleStatus: LifecycleStatus | undefined
): StatusVariant {
  switch (lifecycleStatus) {
    case "ready":
    case "running":
      return "success";
    case "starting":
      return "pending";
    case "stopped":
    case "error":
    case "offline":
      return "destructive";
    case "degraded":
      return "degraded" as StatusVariant;
    default:
      return "secondary";
  }
}

function getStatusLabel(lifecycleStatus: LifecycleStatus | undefined): string {
  if (!lifecycleStatus) return "unknown";
  return lifecycleStatus;
}

function getHealthColor(score: number | undefined): string {
  if (score === undefined) return "text-muted-foreground";
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

// ─── NodeReasonerList ────────────────────────────────────────────────────────

const SHOW_LIMIT = 5;

interface NodeReasonerListProps {
  nodeId: string;
  reasonerCount: number;
  skillCount: number;
}

function NodeReasonerList({ nodeId, reasonerCount, skillCount }: NodeReasonerListProps) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const { data: nodeDetails, isLoading } = useQuery({
    queryKey: ["node-details", nodeId],
    queryFn: () => getNodeDetails(nodeId),
    staleTime: 30_000,
  });

  const reasoners: ReasonerDefinition[] = nodeDetails?.reasoners ?? [];
  const skills: SkillDefinition[] = nodeDetails?.skills ?? [];
  const allItems: Array<{ id: string; name?: string; isSkill?: boolean }> = [
    ...reasoners.map((r) => ({ id: r.id, name: r.name })),
    ...skills.map((s) => ({ id: s.id, name: s.name, isSkill: true })),
  ];
  const total = reasonerCount + skillCount;

  if (isLoading) {
    return (
      <div className="border-t border-border">
        {Array.from({ length: Math.min(total, 3) }).map((_, i) => (
          <div
            key={i}
            className="h-6 mx-4 my-1 rounded bg-muted/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="border-t border-border px-4 py-2">
        <p className="text-xs text-muted-foreground italic">No reasoners registered</p>
      </div>
    );
  }

  const visible = showAll ? allItems : allItems.slice(0, SHOW_LIMIT);
  const hiddenCount = allItems.length - SHOW_LIMIT;

  return (
    <div className="border-t border-border">
      {visible.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between px-4 py-1 hover:bg-accent/30 group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-mono truncate text-foreground/80">
              {item.name || item.id}
            </span>
            {item.isSkill && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 py-0 flex-shrink-0">
                skill
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0 gap-0.5"
            onClick={() => navigate(`/playground/${nodeId}.${item.id}`)}
          >
            <Play className="size-2.5" />
            Play
          </Button>
        </div>
      ))}
      {!showAll && hiddenCount > 0 && (
        <button
          className="w-full px-4 py-1 text-[10px] text-muted-foreground hover:text-foreground text-center transition-colors"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}

// ─── AgentCard ───────────────────────────────────────────────────────────────

interface AgentCardProps {
  node: AgentNodeSummary;
}

function AgentCard({ node }: AgentCardProps) {
  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const statusVariant = getStatusVariant(node.lifecycle_status);
  const statusLabel = getStatusLabel(node.lifecycle_status);
  const totalItems = node.reasoner_count + node.skill_count;
  const healthScore = node.mcp_summary?.overall_health_score;

  const handleRestart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRestarting(true);
    try {
      await startAgent(node.id);
    } catch (err) {
      console.error("Failed to restart agent:", node.id, err);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Card header — entire row is the expand/collapse trigger */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-accent/50 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3.5 text-muted-foreground transition-transform flex-shrink-0",
            open && "rotate-90"
          )}
        />

        <span className="font-mono text-sm font-medium truncate min-w-0">
          {node.id}
        </span>

        <Badge
          variant={statusVariant}
          className="text-[10px] h-5 px-1.5 flex-shrink-0"
        >
          <span
            className={cn(
              "mr-1 inline-block size-1.5 rounded-full flex-shrink-0",
              statusVariant === "success"
                ? "bg-green-400"
                : statusVariant === "pending"
                  ? "bg-yellow-400"
                  : statusVariant === "destructive"
                    ? "bg-red-400"
                    : "bg-muted-foreground"
            )}
          />
          {statusLabel}
        </Badge>

        {totalItems > 0 && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {totalItems} reasoner{totalItems !== 1 ? "s" : ""}
          </span>
        )}

        {node.version && (
          <span className="text-xs text-muted-foreground font-mono flex-shrink-0 hidden sm:inline">
            v{node.version}
          </span>
        )}

        <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
          {formatRelativeTime(node.last_heartbeat)}
        </span>

        {healthScore != null && (
          <span className={cn("text-xs font-mono flex-shrink-0", getHealthColor(healthScore))}>
            {healthScore}
          </span>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="size-7 -mr-1 flex-shrink-0"
          onClick={handleRestart}
          disabled={restarting}
          aria-label="Restart agent"
        >
          <RefreshCw className={cn("size-3", restarting && "animate-spin")} />
        </Button>
      </button>

      {/* Collapsible reasoner list */}
      {open && (
        <NodeReasonerList
          nodeId={node.id}
          reasonerCount={node.reasoner_count}
          skillCount={node.skill_count}
        />
      )}
    </div>
  );
}

// ─── AgentsPage ──────────────────────────────────────────────────────────────

export function AgentsPage() {
  const { data, isLoading, isError, error } = useAgents();
  const nodes = data?.nodes ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isLoading
            ? "Loading agents…"
            : nodes.length === 0
              ? "No agents registered"
              : `${nodes.length} agent node${nodes.length !== 1 ? "s" : ""} registered`}
        </p>
      </div>

      {/* Error state */}
      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load agents:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-10 rounded-md border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && nodes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            No agent nodes found
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Start an agent to see it here. Run{" "}
            <code className="font-mono bg-muted px-1 rounded">af run</code> in
            your agent directory.
          </p>
        </div>
      )}

      {/* Agent cards */}
      {!isLoading && nodes.length > 0 && (
        <div className="flex flex-col gap-2">
          {nodes.map((node) => (
            <AgentCard key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}
