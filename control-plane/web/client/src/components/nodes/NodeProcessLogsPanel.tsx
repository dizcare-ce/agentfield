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
import { ScrollArea } from "@/components/ui/scroll-area";
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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const line = (e.line ?? "").toLowerCase();
      const stream = (e.stream ?? "").toLowerCase();
      return line.includes(q) || stream.includes(q);
    });
  }, [entries, filter]);

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
          Tailed from the agent via the control plane proxy. Requires a
          long-running agent with logs enabled and matching internal auth.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter displayed lines…"
            className="h-9 border-border/80 bg-background text-sm"
            aria-label="Filter log lines"
          />
        </div>

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
              filtered.map((e, i) => (
                <div
                  key={`${e.seq}-${e.ts}-${i}`}
                  className="flex gap-2 border-b border-border/40 py-1 last:border-0"
                >
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                    {e.seq}
                  </span>
                  <Badge
                    variant={e.stream === "stderr" ? "destructive" : "secondary"}
                    className="h-5 shrink-0 px-1.5 text-[9px] font-normal uppercase"
                  >
                    {e.stream || "?"}
                  </Badge>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-foreground/90">
                    {e.line}
                    {e.truncated ? (
                      <span className="text-muted-foreground"> …</span>
                    ) : null}
                  </span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
