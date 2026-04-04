import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/hooks/queries";
import { getNodeDetails } from "@/services/api";
import { startAgent } from "@/services/configurationApi";
import { Card } from "@/components/ui/card";
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
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0 || diffMs > 365 * 24 * 60 * 60 * 1000) return ">1y ago";
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getStatusDotColor(lifecycleStatus: LifecycleStatus | undefined): string {
  switch (lifecycleStatus) {
    case "ready":
    case "running":
      return "bg-green-400";
    case "starting":
      return "bg-yellow-400";
    case "stopped":
    case "error":
    case "offline":
      return "bg-red-400";
    case "degraded":
      return "bg-orange-400";
    default:
      return "bg-muted-foreground";
  }
}

function getStatusTextColor(lifecycleStatus: LifecycleStatus | undefined): string {
  switch (lifecycleStatus) {
    case "ready":
    case "running":
      return "text-green-500";
    case "starting":
      return "text-yellow-500";
    case "stopped":
    case "error":
    case "offline":
      return "text-red-500";
    case "degraded":
      return "text-orange-500";
    default:
      return "text-muted-foreground";
  }
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
      <>
        {Array.from({ length: Math.min(total, 3) }).map((_, i) => (
          <div
            key={i}
            className="h-6 ml-8 mr-4 my-0.5 rounded bg-muted/40 animate-pulse"
          />
        ))}
      </>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="pl-8 pr-4 py-1 bg-muted/30">
        <p className="text-[11px] text-muted-foreground italic">No reasoners registered</p>
      </div>
    );
  }

  const visible = showAll ? allItems : allItems.slice(0, SHOW_LIMIT);
  const hiddenCount = allItems.length - SHOW_LIMIT;

  return (
    <>
      {visible.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between pl-8 pr-4 py-0.5 bg-muted/30 hover:bg-accent/30 group"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-mono truncate text-foreground/70">
              {item.name || item.id}
            </span>
            {item.isSkill && (
              <span className="text-[9px] text-muted-foreground border border-border rounded px-1">
                skill
              </span>
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
          className="w-full pl-8 pr-4 py-0.5 bg-muted/30 text-[10px] text-muted-foreground hover:text-foreground text-left transition-colors"
          onClick={() => setShowAll(true)}
        >
          Show {hiddenCount} more
        </button>
      )}
    </>
  );
}

// ─── AgentRow ────────────────────────────────────────────────────────────────

interface AgentRowProps {
  node: AgentNodeSummary;
}

function AgentRow({ node }: AgentRowProps) {
  const [open, setOpen] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const dotColor = getStatusDotColor(node.lifecycle_status);
  const statusTextColor = getStatusTextColor(node.lifecycle_status);
  const statusLabel = node.lifecycle_status ?? "unknown";
  const totalItems = node.reasoner_count + node.skill_count;

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
    <>
      {/* Main row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-accent/40 transition-colors"
      >
        <ChevronRight
          className={cn(
            "size-3 text-muted-foreground transition-transform flex-shrink-0",
            open && "rotate-90"
          )}
        />

        <span className="font-mono text-sm font-medium truncate min-w-0 flex-1">
          {node.id}
        </span>

        {/* Status dot + label */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={cn("inline-block size-1.5 rounded-full flex-shrink-0", dotColor)} />
          <span className={cn("text-xs flex-shrink-0", statusTextColor)}>
            {statusLabel}
          </span>
        </div>

        {/* Reasoner count */}
        {totalItems > 0 && (
          <span className="text-xs text-muted-foreground flex-shrink-0 w-24 text-right">
            {totalItems} reasoner{totalItems !== 1 ? "s" : ""}
          </span>
        )}

        {/* Version */}
        {node.version && (
          <span className="text-xs text-muted-foreground font-mono flex-shrink-0 w-16 text-right hidden sm:inline">
            v{node.version}
          </span>
        )}

        {/* Heartbeat */}
        <span className="text-xs text-muted-foreground flex-shrink-0 w-20 text-right">
          {formatRelativeTime(node.last_heartbeat)}
        </span>

        {/* Restart button */}
        <Button
          variant="ghost"
          size="icon"
          className="size-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleRestart}
          disabled={restarting}
          aria-label="Restart agent"
        >
          <RefreshCw className={cn("size-3", restarting && "animate-spin")} />
        </Button>
      </button>

      {/* Inline expanded reasoner rows */}
      {open && (
        <NodeReasonerList
          nodeId={node.id}
          reasonerCount={node.reasoner_count}
          skillCount={node.skill_count}
        />
      )}
    </>
  );
}

// ─── AgentsPage ──────────────────────────────────────────────────────────────

export function AgentsPage() {
  const { data, isLoading, isError, error } = useAgents();
  const nodes = data?.nodes ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Subtitle only — breadcrumb handles page identity */}
      <p className="text-sm text-muted-foreground">
        {isLoading
          ? "Loading agents…"
          : nodes.length === 0
            ? "No agents registered"
            : `${nodes.length} agent node${nodes.length !== 1 ? "s" : ""} registered`}
      </p>

      {/* Error state */}
      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load agents:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <Card>
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-10 px-4 py-2.5 animate-pulse"
              >
                <div className="h-4 bg-muted/40 rounded w-48" />
              </div>
            ))}
          </div>
        </Card>
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

      {/* Agent list */}
      {!isLoading && nodes.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="divide-y divide-border">
            {nodes.map((node) => (
              <AgentRow key={node.id} node={node} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
