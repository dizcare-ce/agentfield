import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgents } from "@/hooks/queries";
import { getNodeDetails } from "@/services/api";
import { startAgent } from "@/services/configurationApi";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Function,
  Play,
  RefreshCw,
  Search,
  WatsonxAi,
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

/** Scroll when many endpoints so the agent list stays usable. */
const SCROLL_AFTER = 10;

type NodeEndpointRow = {
  id: string;
  name: string;
  description?: string;
  kind: "reasoner" | "skill";
};

interface NodeReasonerListProps {
  nodeId: string;
  reasonerCount: number;
  skillCount: number;
}

function matchesFilter(q: string, row: NodeEndpointRow): boolean {
  if (!q.trim()) return true;
  const n = q.trim().toLowerCase();
  return (
    row.id.toLowerCase().includes(n) ||
    row.name.toLowerCase().includes(n) ||
    (row.description?.toLowerCase().includes(n) ?? false)
  );
}

function NodeReasonerList({ nodeId, reasonerCount, skillCount }: NodeReasonerListProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");

  const { data: nodeDetails, isLoading, isError, error } = useQuery({
    queryKey: ["node-details", nodeId],
    queryFn: () => getNodeDetails(nodeId),
    staleTime: 30_000,
  });

  const reasoners: ReasonerDefinition[] = nodeDetails?.reasoners ?? [];
  const skills: SkillDefinition[] = nodeDetails?.skills ?? [];

  const reasonerRows: NodeEndpointRow[] = useMemo(
    () =>
      reasoners.map((r) => ({
        id: r.id,
        name: r.name || r.id,
        description: r.description,
        kind: "reasoner" as const,
      })),
    [reasoners]
  );

  const skillRows: NodeEndpointRow[] = useMemo(
    () =>
      skills.map((s) => ({
        id: s.id,
        name: s.name || s.id,
        description: s.description,
        kind: "skill" as const,
      })),
    [skills]
  );

  const filteredReasoners = useMemo(
    () => reasonerRows.filter((r) => matchesFilter(filter, r)),
    [reasonerRows, filter]
  );
  const filteredSkills = useMemo(
    () => skillRows.filter((s) => matchesFilter(filter, s)),
    [skillRows, filter]
  );

  const totalLoaded = reasonerRows.length + skillRows.length;
  const totalExpected = reasonerCount + skillCount;
  const showSearch = totalLoaded >= 10;
  const useScroll = totalLoaded > SCROLL_AFTER;
  const showSectionLabels = reasonerRows.length > 0 && skillRows.length > 0;

  if (isLoading) {
    return (
      <div className="border-t border-border bg-muted/15">
        <div className="pl-10 pr-4 py-2 space-y-2">
          {Array.from({ length: Math.min(Math.max(totalExpected, 1), 4) }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-8 shrink-0 rounded-md bg-muted/50 animate-pulse" />
              <div className="h-4 flex-1 max-w-[200px] rounded bg-muted/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="border-t border-border bg-muted/15 px-4 py-2 pl-10">
        <p className="text-xs text-destructive">
          Could not load endpoints
          {error instanceof Error ? `: ${error.message}` : ""}. Try expanding again or check the node is reachable.
        </p>
      </div>
    );
  }

  if (totalLoaded === 0) {
    return (
      <div className="border-t border-border bg-muted/15 pl-10 pr-4 py-2.5">
        <p className="text-xs text-muted-foreground">No reasoners or skills registered on this node.</p>
      </div>
    );
  }

  const listBody = (
    <div className="divide-y divide-border/70">
      {filteredReasoners.length === 0 && filteredSkills.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-muted-foreground">
          No matches for &quot;{filter.trim()}&quot;
        </div>
      ) : (
        <>
          {filteredReasoners.length > 0 && (
            <>
              {showSectionLabels && (
                <div
                  className="sticky top-0 z-[1] flex items-center gap-2 bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
                  role="presentation"
                >
                  <WatsonxAi className="size-3.5 opacity-80" aria-hidden />
                  Reasoners
                  <span className="font-mono text-[10px] normal-case tracking-normal text-muted-foreground/80">
                    ({filteredReasoners.length})
                  </span>
                </div>
              )}
              {filteredReasoners.map((row) => (
                <EndpointRow key={`r-${row.id}`} nodeId={nodeId} row={row} onOpen={navigate} />
              ))}
            </>
          )}
          {filteredSkills.length > 0 && (
            <>
              {showSectionLabels && (
                <div
                  className="sticky top-0 z-[1] flex items-center gap-2 bg-muted/30 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-sm"
                  role="presentation"
                >
                  <Function className="size-3.5 opacity-80" aria-hidden />
                  Skills
                  <span className="font-mono text-[10px] normal-case tracking-normal text-muted-foreground/80">
                    ({filteredSkills.length})
                  </span>
                </div>
              )}
              {filteredSkills.map((row) => (
                <EndpointRow key={`s-${row.id}`} nodeId={nodeId} row={row} onOpen={navigate} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="border-t border-border bg-muted/15">
      {showSearch && (
        <div className="border-b border-border/60 px-3 py-2 pl-10">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or id…"
              className="h-8 border-border/80 bg-background/80 pl-8 text-xs shadow-none"
              aria-label="Filter reasoners and skills"
            />
          </div>
        </div>
      )}
      <div className="pl-6">
        {useScroll ? (
          <ScrollArea className="max-h-[min(45vh,320px)] pr-3" type="hover">
            {listBody}
          </ScrollArea>
        ) : (
          listBody
        )}
      </div>
    </div>
  );
}

interface EndpointRowProps {
  nodeId: string;
  row: NodeEndpointRow;
  onOpen: (path: string) => void;
}

function EndpointRow({ nodeId, row, onOpen }: EndpointRowProps) {
  const isSkill = row.kind === "skill";
  const Icon = isSkill ? Function : WatsonxAi;
  const label = isSkill ? "skill" : "reasoner";

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-3 px-3 py-2 pl-4 text-left transition-colors",
        "hover:bg-accent/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
      onClick={() => onOpen(`/playground/${nodeId}.${row.id}`)}
      aria-label={`Open ${label} ${row.name} in playground`}
    >
      <span
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
          isSkill
            ? "border-border bg-background text-muted-foreground"
            : "border-border bg-background text-muted-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-medium text-foreground">{row.name}</span>
          <span
            className={cn(
              "rounded-md border px-1.5 py-0 text-[10px] font-medium leading-none",
              isSkill
                ? "border-border/80 bg-muted/50 text-muted-foreground"
                : "border-primary/25 bg-primary/5 text-primary"
            )}
          >
            {isSkill ? "Skill" : "Reasoner"}
          </span>
        </span>
        {row.description ? (
          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {row.description}
          </span>
        ) : (
          <span className="mt-0.5 block font-mono text-[10px] text-muted-foreground/80">{row.id}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 self-center text-muted-foreground">
        <span className="hidden text-[11px] sm:inline">Playground</span>
        <Play className="size-3.5 opacity-70" aria-hidden />
      </span>
    </button>
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
