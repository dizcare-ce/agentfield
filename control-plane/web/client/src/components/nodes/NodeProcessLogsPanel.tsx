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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  AlertCircle,
  Copy,
  Download,
  PauseCircle,
  Play,
  RefreshCw,
  Terminal,
} from "@/components/ui/icon-bridge";
import { cn } from "@/lib/utils";
import {
  fetchNodeLogsText,
  parseNodeLogsNDJSON,
  streamNodeLogsEntries,
  type NodeLogEntry,
} from "@/services/api";

const MAX_BUFFER = 5000;
const DEFAULT_TAIL = "200";

type StreamFilter = "all" | "stdout" | "stderr";

function normalizeStream(s: string | undefined): "stdout" | "stderr" | "other" {
  const x = (s ?? "").toLowerCase();
  if (x === "stderr" || x === "err") return "stderr";
  if (x === "stdout" || x === "out") return "stdout";
  return "other";
}

/** Wall time for scanning; falls back to — if missing/invalid. */
function formatLogTime(iso: string | undefined): string {
  if (!iso?.trim()) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatLogDate(iso: string | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function levelBadgeVariant(
  level: string | undefined
): "default" | "secondary" | "destructive" | "outline" {
  const l = (level ?? "").toLowerCase();
  if (l === "error" || l === "fatal" || l === "critical") return "destructive";
  if (l === "warn" || l === "warning") return "outline";
  if (l === "info" || l === "log") return "secondary";
  return "outline";
}

export interface NodeProcessLogsPanelProps {
  nodeId: string;
  className?: string;
}

function maxSeq(entries: NodeLogEntry[]): number {
  let m = 0;
  for (const e of entries) {
    if (typeof e.seq === "number" && e.seq > m) m = e.seq;
  }
  return m;
}

export function NodeProcessLogsPanel({
  nodeId,
  className,
}: NodeProcessLogsPanelProps) {
  const [entries, setEntries] = useState<NodeLogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");
  const [live, setLive] = useState(false);
  const [loadingTail, setLoadingTail] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const liveAbortRef = useRef<AbortController | null>(null);
  const sinceSeqRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stopLive = useCallback(() => {
    liveAbortRef.current?.abort();
    liveAbortRef.current = null;
    setLive(false);
  }, []);

  const loadTail = useCallback(async () => {
    setLoadingTail(true);
    setStreamError(null);
    try {
      const text = await fetchNodeLogsText(nodeId, {
        tail_lines: DEFAULT_TAIL,
      });
      const parsed = parseNodeLogsNDJSON(text);
      setEntries(parsed.slice(-MAX_BUFFER));
    } catch (e) {
      setStreamError(e instanceof Error ? e.message : "Failed to load logs");
    } finally {
      setLoadingTail(false);
    }
  }, [nodeId]);

  useEffect(() => {
    void loadTail();
  }, [loadTail]);

  useEffect(() => {
    if (!live) return;

    const since = sinceSeqRef.current;
    const ac = new AbortController();
    liveAbortRef.current = ac;

    (async () => {
      try {
        for await (const entry of streamNodeLogsEntries(
          nodeId,
          { follow: "1", since_seq: String(since) },
          ac.signal
        )) {
          setStreamError(null);
          setEntries((prev) => [...prev, entry].slice(-MAX_BUFFER));
        }
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setStreamError(
          e instanceof Error ? e.message : "Log stream interrupted"
        );
      } finally {
        if (liveAbortRef.current === ac) {
          liveAbortRef.current = null;
          setLive(false);
        }
      }
    })();

    return () => {
      ac.abort();
    };
  }, [live, nodeId]);

  const streamCounts = useMemo(() => {
    let stdout = 0;
    let stderr = 0;
    let other = 0;
    for (const e of entries) {
      const k = normalizeStream(e.stream);
      if (k === "stdout") stdout += 1;
      else if (k === "stderr") stderr += 1;
      else other += 1;
    }
    return { all: entries.length, stdout, stderr, other };
  }, [entries]);

  const streamScoped = useMemo(() => {
    if (streamFilter === "all") return entries;
    return entries.filter((e) => normalizeStream(e.stream) === streamFilter);
  }, [entries, streamFilter]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return streamScoped;
    return streamScoped.filter((e) => {
      const line = (e.line ?? "").toLowerCase();
      const stream = (e.stream ?? "").toLowerCase();
      const level = (e.level ?? "").toLowerCase();
      const source = (e.source ?? "").toLowerCase();
      const seq = String(e.seq ?? "");
      return (
        line.includes(q) ||
        stream.includes(q) ||
        level.includes(q) ||
        source.includes(q) ||
        seq.includes(q)
      );
    });
  }, [streamScoped, filter]);

  const ndjsonBlob = useMemo(() => {
    return filtered.map((e) => JSON.stringify(e)).join("\n");
  }, [filtered]);

  const copyVisible = useCallback(() => {
    void navigator.clipboard.writeText(ndjsonBlob);
  }, [ndjsonBlob]);

  const downloadVisible = useCallback(() => {
    const blob = new Blob([ndjsonBlob], {
      type: "application/x-ndjson",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nodeId}-logs.ndjson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [ndjsonBlob, nodeId]);

  useEffect(() => {
    if (!live || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filtered.length, live]);

  return (
    <Card className={cn("border-border/80 shadow-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-muted-foreground" aria-hidden />
            <CardTitle className="text-sm font-medium">
              Process logs
            </CardTitle>
            <Badge variant="outline" className="font-mono text-[10px]">
              NDJSON
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              disabled={loadingTail || live}
              onClick={() => {
                stopLive();
                void loadTail();
              }}
            >
              <RefreshCw
                className={cn("size-3.5", loadingTail && "animate-spin")}
              />
              <span className="ml-1.5 text-xs">Refresh</span>
            </Button>
            <Button
              type="button"
              variant={live ? "secondary" : "default"}
              size="sm"
              className="h-8"
              onClick={() => {
                if (live) {
                  stopLive();
                } else {
                  sinceSeqRef.current = maxSeq(entries);
                  setStreamError(null);
                  setLive(true);
                }
              }}
            >
              {live ? (
                <>
                  <PauseCircle className="size-3.5" />
                  <span className="ml-1.5 text-xs">Pause</span>
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  <span className="ml-1.5 text-xs">Live</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={copyVisible}
              disabled={filtered.length === 0}
            >
              <Copy className="size-3.5" />
              <span className="ml-1.5 text-xs">Copy</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={downloadVisible}
              disabled={filtered.length === 0}
            >
              <Download className="size-3.5" />
              <span className="ml-1.5 text-xs">Download</span>
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          NDJSON from the agent (UTC timestamps, seq, stdout/stderr). Filter by
          stream, then search text, seq, level, or source when the SDK emits them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
          <div
            className="min-w-0 flex-1 space-y-1.5"
            role="group"
            aria-label="Filter by stdout or stderr"
          >
            <p className="text-xs font-medium text-muted-foreground">Stream</p>
            <SegmentedControl
              value={streamFilter}
              onValueChange={(v) => setStreamFilter(v as StreamFilter)}
              size="sm"
              className="w-full sm:w-auto"
              options={[
                {
                  value: "all",
                  label: `All${streamCounts.all ? ` (${streamCounts.all})` : ""}`,
                },
                {
                  value: "stdout",
                  label: `Stdout${streamCounts.stdout ? ` (${streamCounts.stdout})` : ""}`,
                },
                {
                  value: "stderr",
                  label: `Stderr${streamCounts.stderr ? ` (${streamCounts.stderr})` : ""}`,
                },
              ]}
            />
          </div>
          {streamCounts.other > 0 ? (
            <p className="text-[11px] text-muted-foreground sm:pb-1">
              {streamCounts.other} line{streamCounts.other === 1 ? "" : "s"} on
              other streams (shown in All only)
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`${nodeId}-log-text-filter`}
            className="text-xs text-muted-foreground"
          >
            Search in visible lines
          </Label>
          <Input
            id={`${nodeId}-log-text-filter`}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Text, seq, level, source…"
            className="h-9 border-border/80 bg-background text-sm"
            aria-label="Filter log lines by text"
          />
        </div>

        {filter.trim() !== "" || streamFilter !== "all" ? (
          <p className="text-[11px] text-muted-foreground">
            {filter.trim() !== "" ? (
              <>
                <span className="font-medium tabular-nums text-foreground">
                  {filtered.length}
                </span>{" "}
                match{filtered.length === 1 ? "" : "es"} within{" "}
                <span className="tabular-nums">{streamScoped.length}</span> line
                {streamScoped.length === 1 ? "" : "s"}
                {streamFilter !== "all" ? ` (${streamFilter})` : ""}
              </>
            ) : (
              <>
                <span className="font-medium tabular-nums text-foreground">
                  {filtered.length}
                </span>{" "}
                line{filtered.length === 1 ? "" : "s"} · stream: {streamFilter}
              </>
            )}
          </p>
        ) : null}

        {streamError ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle className="text-sm">Logs unavailable</AlertTitle>
            <AlertDescription className="text-xs">{streamError}</AlertDescription>
          </Alert>
        ) : null}

        <ScrollArea
          ref={scrollRef}
          className="h-[min(420px,50vh)] w-full rounded-md border border-border/80 bg-muted/20"
        >
          <div className="space-y-0 p-2 font-mono text-[11px] leading-relaxed">
            {filtered.length === 0 && !loadingTail ? (
              <p className="px-2 py-6 text-center text-muted-foreground text-xs">
                No log lines yet. Try Refresh, or enable live tail if the agent
                supports streaming.
              </p>
            ) : (
              filtered.map((e, i) => {
                const ns = normalizeStream(e.stream);
                const dateHint = formatLogDate(e.ts);
                const timeStr = formatLogTime(e.ts);
                const title = `${e.ts ?? ""} · seq ${e.seq ?? "?"}${
                  e.level ? ` · ${e.level}` : ""
                }${e.source ? ` · ${e.source}` : ""}`;
                return (
                  <div
                    key={`${e.seq}-${e.ts}-${i}`}
                    title={title}
                    className={cn(
                      "flex flex-col gap-1 border-b border-border/40 py-1.5 last:border-0 sm:flex-row sm:items-start sm:gap-3",
                      ns === "stderr" && "bg-destructive/[0.04]"
                    )}
                  >
                    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums text-[10px] text-muted-foreground sm:w-[7.25rem] sm:flex-col sm:items-start sm:gap-0.5">
                      <time
                        dateTime={e.ts}
                        className="leading-tight sm:w-full"
                      >
                        {dateHint ? (
                          <span className="block truncate text-[9px] text-muted-foreground/90">
                            {dateHint}
                          </span>
                        ) : null}
                        <span className="block font-medium text-muted-foreground">
                          {timeStr}
                        </span>
                      </time>
                      <span className="text-[10px] text-muted-foreground/70 sm:font-mono">
                        #{e.seq}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <Badge
                        variant={ns === "stderr" ? "destructive" : "secondary"}
                        className="h-5 shrink-0 px-1.5 text-[9px] font-normal uppercase"
                      >
                        {ns === "other" ? e.stream || "?" : ns}
                      </Badge>
                      {e.level ? (
                        <Badge
                          variant={levelBadgeVariant(e.level)}
                          className="h-5 max-w-[6rem] shrink-0 truncate px-1.5 text-[9px] font-normal capitalize"
                        >
                          {e.level}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {e.source ? (
                        <span className="mb-0.5 block truncate text-[10px] text-muted-foreground">
                          {e.source}
                        </span>
                      ) : null}
                      <span className="whitespace-pre-wrap break-all text-foreground/90">
                        {e.line}
                        {e.truncated ? (
                          <span className="text-muted-foreground"> …</span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
