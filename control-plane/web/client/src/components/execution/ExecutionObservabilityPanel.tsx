import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchBar } from "@/components/ui/SearchBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnifiedJsonViewer } from "@/components/ui/UnifiedJsonViewer";
import {
  AlertCircle,
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
import { ExecutionTimeline } from "./ExecutionTimeline";

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
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-base sm:text-lg">Execution Observability</CardTitle>
            <CardDescription className="max-w-3xl">
              Follow the execution lifecycle, inspect correlated runtime logs, and open raw
              node output for low-level debugging without leaving the execution page.
            </CardDescription>
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
              <Badge variant="default" className="font-mono">Live</Badge>
            ) : (
              <Badge variant="secondary" className="font-mono">Snapshot</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <Tabs defaultValue="logs" className="space-y-4">
          <TabsList variant="underline" className="w-full justify-start">
            <TabsTrigger value="logs" variant="underline">Logs</TabsTrigger>
            <TabsTrigger value="timeline" variant="underline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="logs" className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-center">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search message, source, reasoner, or attributes…"
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
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Showing {logSummary.visible} of {logSummary.total} log events</span>
                {search ? <Badge variant="outline" className="font-mono">Query: {search}</Badge> : null}
                {levelFilter !== "all" ? <Badge variant="outline" className="font-mono">Level: {levelFilter}</Badge> : null}
                {nodeFilter !== "all" ? <Badge variant="outline" className="font-mono">Node: {nodeFilter}</Badge> : null}
                {sourceFilter !== "all" ? <Badge variant="outline" className="font-mono">Source: {sourceFilter}</Badge> : null}
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
                  <div className="space-y-3">
                    {filteredEntries.map((entry) => (
                      <article
                        key={`${entry.execution_id}-${entry.seq}-${entry.ts}`}
                        className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-xs"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant={levelVariant(entry.level)} className="font-mono uppercase">
                              {entry.level}
                            </Badge>
                            <Badge variant="outline" className="font-mono">
                              {entry.agent_node_id}
                            </Badge>
                            <Badge variant="secondary" className="font-mono">
                              {entry.source}
                            </Badge>
                            {entry.reasoner_id ? (
                              <Badge variant="outline" className="font-mono">
                                {entry.reasoner_id}
                              </Badge>
                            ) : null}
                            {entry.event_type ? (
                              <Badge variant="outline" className="font-mono">
                                {entry.event_type}
                              </Badge>
                            ) : null}
                            <span className="font-mono text-muted-foreground">
                              {formatTimestamp(entry.ts)}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                              {entry.message}
                            </p>

                            {hasAttributes(entry.attributes) ? (
                              <details className="rounded-lg border border-border/60 bg-muted/25 p-3">
                                <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Attributes
                                </summary>
                                <div className="mt-3 overflow-hidden rounded-md border border-border/50 bg-background">
                                  <UnifiedJsonViewer
                                    data={entry.attributes}
                                    searchable={false}
                                    showHeader={false}
                                    className="border-0"
                                    maxHeight="18rem"
                                  />
                                </div>
                              </details>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="timeline">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <ExecutionTimeline execution={execution} />
            </div>
          </TabsContent>
        </Tabs>
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
