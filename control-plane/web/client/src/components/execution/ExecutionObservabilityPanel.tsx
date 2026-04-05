import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchBar } from "@/components/ui/SearchBar";
import { UnifiedJsonViewer } from "@/components/ui/UnifiedJsonViewer";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  Settings,
  Terminal,
} from "@/components/ui/icon-bridge";
import { cn } from "@/lib/utils";
import { NodeProcessLogsPanel } from "@/components/nodes";
import { getExecutionLogs, streamExecutionLogs } from "@/services/executionsApi";
import type { ExecutionLogEntry, WorkflowExecution } from "@/types/executions";

const DEFAULT_TAIL = 250;
const MAX_BUFFER = 1000;

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = level.toLowerCase();
  if (normalized === "error" || normalized === "fatal" || normalized === "critical") {
    return "destructive";
  }
  if (normalized === "warn" || normalized === "warning") {
    return "outline";
  }
  if (normalized === "debug" || normalized === "trace") {
    return "secondary";
  }
  return "default";
}

function hasAttributes(attributes: ExecutionLogEntry["attributes"]): boolean {
  if (attributes == null) return false;
  if (typeof attributes === "string") {
    return attributes.trim() !== "" && attributes.trim() !== "{}";
  }
  if (Array.isArray(attributes)) {
    return attributes.length > 0;
  }
  if (typeof attributes === "object") {
    return Object.keys(attributes).length > 0;
  }
  return true;
}

function appendUniqueSorted(values: string[], nextValue?: string): string[] {
  const set = new Set(values.filter(Boolean));
  if (nextValue?.trim()) {
    set.add(nextValue.trim());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

interface ExecutionObservabilityPanelProps {
  execution: WorkflowExecution;
  className?: string;
}

export function ExecutionObservabilityPanel({
  execution,
  className,
}: ExecutionObservabilityPanelProps) {
  const [entries, setEntries] = useState<ExecutionLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [nodeFilter, setNodeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [rawLogsOpen, setRawLogsOpen] = useState(false);
  const [selectedRawNodeId, setSelectedRawNodeId] = useState(execution.agent_node_id);
  const latestSeqRef = useRef(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getExecutionLogs(execution.execution_id, { tail: DEFAULT_TAIL });
      const trimmed = response.entries.slice(-MAX_BUFFER);
      setEntries(trimmed);
      latestSeqRef.current = trimmed.reduce((max, entry) => Math.max(max, entry.seq ?? 0), 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load execution logs");
    } finally {
      setLoading(false);
    }
  }, [execution.execution_id]);

  useEffect(() => {
    void loadLogs();
    setSelectedRawNodeId(execution.agent_node_id);
    setLive(false);
  }, [execution.execution_id, execution.agent_node_id, loadLogs]);

  useEffect(() => {
    if (!live) return;

    const source = streamExecutionLogs(execution.execution_id, {
      afterSeq: latestSeqRef.current,
    });

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as ExecutionLogEntry & { type?: string };
        if (payload.type === "connected" || payload.type === "heartbeat") {
          return;
        }
        setError(null);
        setEntries((prev) => {
          const next = [...prev, payload].slice(-MAX_BUFFER);
          latestSeqRef.current = next.reduce((max, entry) => Math.max(max, entry.seq ?? 0), 0);
          return next;
        });
      } catch {
        // Ignore malformed heartbeat or non-log events.
      }
    };

    source.onerror = () => {
      setError("Execution log stream interrupted");
      setLive(false);
      source.close();
    };

    return () => {
      source.close();
    };
  }, [execution.execution_id, live]);

  const availableLevels = useMemo(() => {
    return entries.reduce<string[]>((acc, entry) => appendUniqueSorted(acc, entry.level), []);
  }, [entries]);

  const availableNodeIds = useMemo(() => {
    return entries.reduce<string[]>(
      (acc, entry) => appendUniqueSorted(acc, entry.agent_node_id),
      execution.agent_node_id ? [execution.agent_node_id] : [],
    );
  }, [entries, execution.agent_node_id]);

  const availableSources = useMemo(() => {
    return entries.reduce<string[]>((acc, entry) => appendUniqueSorted(acc, entry.source), []);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (levelFilter !== "all" && entry.level !== levelFilter) return false;
      if (nodeFilter !== "all" && entry.agent_node_id !== nodeFilter) return false;
      if (sourceFilter !== "all" && entry.source !== sourceFilter) return false;
      if (!query) return true;

      return [
        entry.message,
        entry.source,
        entry.level,
        entry.agent_node_id,
        entry.reasoner_id,
        entry.event_type,
        JSON.stringify(entry.attributes ?? {}),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [entries, levelFilter, nodeFilter, search, sourceFilter]);

  const systemCount = useMemo(
    () => entries.filter((entry) => entry.system_generated).length,
    [entries],
  );

  const logSummary = useMemo(() => {
    return {
      total: entries.length,
      visible: filteredEntries.length,
      nodes: availableNodeIds.length,
      live,
      system: systemCount,
    };
  }, [availableNodeIds.length, entries.length, filteredEntries.length, live, systemCount]);

  const rawNodeOptions = useMemo(
    () => availableNodeIds.map((value) => ({ value, label: value })),
    [availableNodeIds],
  );

  return (
    <Card className={cn("border-border/80 shadow-sm", className)}>
      <CardContent className="space-y-4 px-4 py-4 sm:px-6 sm:py-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-center">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search message, source, reasoner, event, or attributes…"
            size="md"
          />

          <FilterCombobox
            label="Filter by level"
            value={levelFilter}
            onValueChange={setLevelFilter}
            options={[
              { value: "all", label: "All levels" },
              ...availableLevels.map((value) => ({ value, label: value })),
            ]}
            placeholder="All levels"
            className="w-full lg:w-auto"
          />

          <FilterCombobox
            label="Filter by node"
            value={nodeFilter}
            onValueChange={setNodeFilter}
            options={[
              { value: "all", label: "All nodes" },
              ...availableNodeIds.map((value) => ({ value, label: value })),
            ]}
            placeholder="All nodes"
            className="w-full lg:w-auto"
          />

          <FilterCombobox
            label="Filter by source"
            value={sourceFilter}
            onValueChange={setSourceFilter}
            options={[
              { value: "all", label: "All sources" },
              ...availableSources.map((value) => ({ value, label: value })),
            ]}
            placeholder="All sources"
            className="w-full lg:w-auto"
          />

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadLogs()}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              variant={live ? "secondary" : "default"}
              size="sm"
              onClick={() => setLive((prev) => !prev)}
              className="gap-2"
            >
              {live ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {live ? "Pause live" : "Go live"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRawLogsOpen(true)}
              className="gap-2"
            >
              <Terminal className="h-4 w-4" />
              Raw node logs
            </Button>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Observability stream unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 sm:p-4">
          <div className="mb-3 flex flex-col gap-2 border-b border-border/60 pb-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                Showing {logSummary.visible} of {logSummary.total} events
              </span>
              {search ? (
                <Badge variant="outline" className="font-mono">
                  Query: {search}
                </Badge>
              ) : null}
              {levelFilter !== "all" ? (
                <Badge variant="outline" className="font-mono">
                  Level: {levelFilter}
                </Badge>
              ) : null}
              {nodeFilter !== "all" ? (
                <Badge variant="outline" className="font-mono">
                  Node: {nodeFilter}
                </Badge>
              ) : null}
              {sourceFilter !== "all" ? (
                <Badge variant="outline" className="font-mono">
                  Source: {sourceFilter}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {logSummary.total} events
              </Badge>
              <Badge variant="outline" className="font-mono">
                {logSummary.nodes} node{logSummary.nodes === 1 ? "" : "s"}
              </Badge>
              <Badge variant="outline" className="font-mono">
                {logSummary.system} system
              </Badge>
              {live ? (
                <Badge variant="default" className="font-mono">
                  Live
                </Badge>
              ) : (
                <Badge variant="secondary" className="font-mono">
                  Snapshot
                </Badge>
              )}
            </div>
          </div>

          <ScrollArea className="h-[30rem] pr-3">
            {loading ? (
              <div className="flex h-full min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading execution logs…
                </div>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex min-h-[16rem] items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/80 px-6 text-center text-sm text-muted-foreground">
                No structured execution logs match the current filters yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/70 bg-background/95">
                {filteredEntries.map((entry) => (
                  <Collapsible
                    key={`${entry.execution_id}-${entry.seq}-${entry.ts}`}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <div className="px-4 py-2.5">
                      <div className="flex items-start gap-3">
                        <span className="min-w-[5.5rem] pt-0.5 font-mono text-[11px] text-muted-foreground">
                          {formatTimestamp(entry.ts)}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Badge
                              variant={levelVariant(entry.level)}
                              className="h-5 font-mono uppercase"
                            >
                              {entry.level}
                            </Badge>
                            <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                              {entry.message}
                            </p>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="font-mono">seq:{entry.seq}</span>
                            <span className="font-mono">node:{entry.agent_node_id}</span>
                            <span className="font-mono">source:{entry.source}</span>
                            {entry.reasoner_id ? (
                              <span className="font-mono">reasoner:{entry.reasoner_id}</span>
                            ) : null}
                            {entry.event_type ? (
                              <span className="font-mono">event:{entry.event_type}</span>
                            ) : null}
                          </div>
                        </div>

                        {hasAttributes(entry.attributes) ? (
                          <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                            <ChevronRight className="h-3.5 w-3.5 group-data-[state=open]:hidden" />
                            <ChevronDown className="hidden h-3.5 w-3.5 group-data-[state=open]:block" />
                            attrs
                          </CollapsibleTrigger>
                        ) : null}
                      </div>

                      {hasAttributes(entry.attributes) ? (
                        <CollapsibleContent className="mt-2 pl-[calc(5.5rem+0.75rem)]">
                          <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/10">
                            <UnifiedJsonViewer
                              data={entry.attributes}
                              searchable={false}
                              showHeader={false}
                              className="border-0"
                              maxHeight="14rem"
                            />
                          </div>
                        </CollapsibleContent>
                      ) : null}
                    </div>
                  </Collapsible>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>

      <Drawer open={rawLogsOpen} onOpenChange={setRawLogsOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="space-y-3">
            <DrawerTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Advanced raw node logs
            </DrawerTitle>
            <DrawerDescription>
              Process-level stdout and stderr for the selected node. These logs are useful for
              deep debugging and may include activity outside this execution.
            </DrawerDescription>
            {rawNodeOptions.length > 1 ? (
              <div className="max-w-xs">
                <FilterCombobox
                  label="Select node"
                  value={selectedRawNodeId}
                  onValueChange={setSelectedRawNodeId}
                  options={rawNodeOptions}
                  placeholder="Select a node"
                />
              </div>
            ) : null}
          </DrawerHeader>

          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <NodeProcessLogsPanel nodeId={selectedRawNodeId} />
          </div>
        </DrawerContent>
      </Drawer>
    </Card>
  );
}
