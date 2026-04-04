import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Copy,
  Play,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRuns, useCancelExecution, useAgents } from "@/hooks/queries";
import type { WorkflowSummary } from "@/types/workflows";
import {
  getStatusLabel,
  normalizeExecutionStatus,
  type CanonicalStatus,
} from "@/utils/status";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { FilterCombobox } from "@/components/ui/filter-combobox";
import { FilterMultiCombobox } from "@/components/ui/filter-multi-combobox";
import { SearchBar } from "@/components/ui/SearchBar";
import { Separator } from "@/components/ui/separator";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { getExecutionDetails } from "@/services/executionsApi";
import {
  JsonHighlightedPre,
  formatTruncatedFormattedJson,
} from "@/components/ui/json-syntax-highlight";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Compact run id for tables: full id if short, else ellipsis + last `tail` chars. */
function shortRunIdDisplay(runId: string, tail = 4): string {
  const t = Math.max(2, tail);
  if (runId.length <= t + 2) return runId;
  return `…${runId.slice(-t)}`;
}

function formatAbsoluteStarted(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Human-readable time since `startedMs` relative to `nowMs`.
 * When `liveGranular` is true (running), uses second-level precision under 1h, then hours/minutes under 24h.
 * Other in-flight states still re-render on the same tick but use natural phrasing via RelativeTimeFormat.
 */
function formatRelativeStarted(
  startedMs: number,
  nowMs: number,
  liveGranular: boolean,
): string {
  const diff = Math.max(0, nowMs - startedMs);
  const s = Math.floor(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (liveGranular) {
    if (s < 8) return "just now";
    if (s < 3600) {
      if (s < 60) return `${s}s ago`;
      const m = Math.floor(s / 60);
      const rs = s % 60;
      return `${m}m ${rs}s ago`;
    }
    if (s < 86400) {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
    }
  } else if (s < 10) {
    return "just now";
  }

  if (s < 60) return rtf.format(-s, "second");
  const min = Math.floor(s / 60);
  if (min < 60) return rtf.format(-min, "minute");
  const hrs = Math.floor(s / 3600);
  if (hrs < 24) return rtf.format(-hrs, "hour");
  const days = Math.floor(s / 86400);
  if (days < 7) return rtf.format(-days, "day");
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return rtf.format(-weeks, "week");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  const years = Math.floor(days / 365);
  return rtf.format(-Math.max(1, years), "year");
}

function StartedAtCell({ run }: { run: WorkflowSummary }) {
  const iso = run.started_at;
  const canonical = normalizeExecutionStatus(run.status);
  const tick = !run.terminal;
  const liveGranular = tick && canonical === "running";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!tick) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tick]);

  if (!iso) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const startedMs = new Date(iso).getTime();
  if (Number.isNaN(startedMs)) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const nowMs = tick ? now : Date.now();
  const absolute = formatAbsoluteStarted(iso);
  const relative = formatRelativeStarted(startedMs, nowMs, liveGranular);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex cursor-default flex-col items-start gap-0.5 leading-tight text-left",
            liveGranular && "tabular-nums",
          )}
        >
          <span
            className={cn(
              "text-[11px]",
              liveGranular ? "text-sky-400/95" : "text-foreground/90",
            )}
          >
            {relative}
          </span>
          <span className="text-[10px] text-muted-foreground">{absolute}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-xs text-xs">
        <p className="font-medium">Started</p>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{absolute}</p>
        <p className="mt-1 text-muted-foreground">
          {liveGranular
            ? "Live elapsed time (updates every second)."
            : tick
              ? "In-flight run; relative time updates as the clock advances."
              : "Exact start time in your locale."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function formatDuration(ms: number | undefined, terminal?: boolean): string {
  if (!terminal && ms == null) return "—";
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    const rem = Math.round(secs % 60);
    return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

function StatusDot({ status }: { status: string }) {
  const canonical = normalizeExecutionStatus(status);
  const color =
    canonical === "succeeded"
      ? "bg-green-500"
      : canonical === "failed" || canonical === "timeout"
        ? "bg-red-500"
        : canonical === "running"
          ? "bg-blue-500"
          : "bg-muted-foreground";

  const label =
    canonical === "succeeded"
      ? "ok"
      : canonical === "failed"
        ? "failed"
        : canonical === "running"
          ? "running"
          : canonical === "timeout"
            ? "timeout"
            : canonical === "cancelled"
              ? "cancelled"
              : canonical === "pending" || canonical === "queued"
                ? "pending"
                : canonical;

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("size-1.5 rounded-full shrink-0", color)} />
      <span className="text-[11px]">{label}</span>
    </div>
  );
}

// ─── RunPreview ────────────────────────────────────────────────────────────────

const PREVIEW_JSON_MAX = 10_000;

function hasMeaningfulPayload(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function formatPreviewJson(value: unknown): string {
  return formatTruncatedFormattedJson(value, PREVIEW_JSON_MAX);
}

function RunPreviewIoPanel({
  label,
  direction,
  body,
}: {
  label: string;
  direction: "in" | "out";
  body: string;
}) {
  const Icon = direction === "in" ? ArrowDown : ArrowUp;
  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div className="flex h-7 shrink-0 items-center justify-between gap-1.5 border-b border-border/70 bg-muted/30 px-2">
        <div className="flex min-w-0 items-center gap-1">
          <Icon
            className={cn(
              "size-3 shrink-0",
              direction === "in" ? "text-sky-500/90" : "text-emerald-500/90",
            )}
            strokeWidth={2.25}
            aria-hidden
          />
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
        </div>
        {body !== "—" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            title={`Copy ${label.toLowerCase()}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void navigator.clipboard.writeText(body);
            }}
          >
            <Copy className="size-3" />
            <span className="sr-only">Copy {label}</span>
          </Button>
        ) : null}
      </div>
      <JsonHighlightedPre
        text={body}
        className={cn(
          "max-h-36 min-h-0 overflow-auto p-2 font-mono text-[10px] leading-snug",
        )}
      />
    </div>
  );
}

function RunPreview({ rootExecutionId }: { rootExecutionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["run-preview", rootExecutionId],
    queryFn: () => getExecutionDetails(rootExecutionId),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-2.5">
        <Skeleton className="mb-2 h-5 w-20" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  const hasIn = hasMeaningfulPayload(data?.input_data);
  const hasOut = hasMeaningfulPayload(data?.output_data);

  if (!hasIn && !hasOut) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground leading-snug">
        No input or output payload on this run.
      </div>
    );
  }

  const inputText = formatPreviewJson(data?.input_data);
  const outputText = formatPreviewJson(data?.output_data);

  if (hasIn && hasOut) {
    return (
      <div
        className="min-w-0 text-xs"
        role="region"
        aria-label="Input and output preview"
      >
        <div className="grid min-h-0 min-w-0 grid-cols-2 divide-x divide-border/80">
          <RunPreviewIoPanel label="Input" direction="in" body={inputText} />
          <RunPreviewIoPanel label="Output" direction="out" body={outputText} />
        </div>
        <p className="border-t border-border/60 px-2 py-1 text-[9px] leading-tight text-muted-foreground">
          Open run for full JSON and trace.
        </p>
      </div>
    );
  }

  if (hasIn) {
    return (
      <div className="min-w-0 text-xs" role="region" aria-label="Input preview">
        <RunPreviewIoPanel label="Input" direction="in" body={inputText} />
        <p className="border-t border-border/60 px-2 py-1 text-[9px] leading-tight text-muted-foreground">
          Open run for output and full trace.
        </p>
      </div>
    );
  }

  return (
    <div className="min-w-0 text-xs" role="region" aria-label="Output preview">
      <RunPreviewIoPanel label="Output" direction="out" body={outputText} />
      <p className="border-t border-border/60 px-2 py-1 text-[9px] leading-tight text-muted-foreground">
        Open run for full trace.
      </p>
    </div>
  );
}

// ─── constants ─────────────────────────────────────────────────────────────────

const TIME_OPTIONS = [
  { value: "1h", label: "Last 1h" },
  { value: "6h", label: "Last 6h" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
  { value: "all", label: "All time" },
];

/** Statuses exposed in the multi-select (canonical); empty selection = no API/client status filter. */
const FILTER_STATUS_CANONICAL = [
  "succeeded",
  "failed",
  "running",
  "pending",
  "queued",
  "timeout",
  "cancelled",
  "waiting",
  "paused",
] as const satisfies readonly CanonicalStatus[];

function StatusMenuDot({ canonical }: { canonical: CanonicalStatus }) {
  const color =
    canonical === "succeeded"
      ? "bg-green-500"
      : canonical === "failed" || canonical === "timeout"
        ? "bg-red-500"
        : canonical === "running"
          ? "bg-blue-500"
          : "bg-muted-foreground";

  return (
    <span
      className={cn("inline-flex size-2 shrink-0 rounded-full", color)}
      aria-hidden
    />
  );
}

/** Page numbers to render (1-based), with ellipsis when there are gaps. */
function getPaginationPages(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total < 1) return [];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const set = new Set([1, total, current, current - 1, current + 1]);
  const nums = [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  let prev = 0;
  for (const p of nums) {
    if (p - prev > 1) out.push("ellipsis");
    out.push(p);
    prev = p;
  }
  return out;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

interface RunsPaginationBarProps {
  placement: "top" | "bottom";
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  pageRowCount: number;
  isFetching: boolean;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  setPageSize: (n: number) => void;
}

function RunsPaginationBar({
  placement,
  totalCount,
  totalPages,
  page,
  pageSize,
  pageRowCount,
  isFetching,
  setPage,
  setPageSize,
}: RunsPaginationBarProps) {
  if (totalCount <= 0 || totalPages <= 0) return null;

  const rowsPerPageLabel =
    placement === "top"
      ? "Rows per page (above table)"
      : "Rows per page (below table)";
  const paginationNavLabel =
    placement === "top"
      ? "Runs list pages, above table"
      : "Runs list pages, below table";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        placement === "top" && "border-b border-border/70 pb-3",
        placement === "bottom" && "pt-3",
      )}
    >
      <p className="text-center text-[11px] text-muted-foreground sm:text-left tabular-nums">
        Showing{" "}
        <span className="font-medium text-foreground">
          {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}
        </span>
        –
        <span className="font-medium text-foreground">
          {totalCount === 0 ? 0 : (page - 1) * pageSize + pageRowCount}
        </span>{" "}
        of <span className="font-medium text-foreground">{totalCount}</span>{" "}
        run{totalCount === 1 ? "" : "s"}
      </p>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-[11px] text-muted-foreground">
            Rows per page
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger
              className="h-8 w-[4.25rem] text-xs"
              aria-label={rowsPerPageLabel}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Pagination
          className="mx-0 w-auto justify-center sm:justify-end"
          aria-label={paginationNavLabel}
        >
          <PaginationContent className="flex-wrap justify-center gap-0.5 sm:justify-end">
            <PaginationItem>
              <PaginationPrevious
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              />
            </PaginationItem>
            {getPaginationPages(page, totalPages).map((item, i) =>
              item === "ellipsis" ? (
                <PaginationEllipsis key={`${placement}-e-${i}`} />
              ) : (
                <PaginationLink
                  key={`${placement}-p-${item}`}
                  isActive={item === page}
                  disabled={isFetching}
                  aria-label={`Page ${item}`}
                  onClick={() => setPage(item)}
                >
                  {item}
                </PaginationLink>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export function RunsPage() {
  const navigate = useNavigate();
  const cancelMutation = useCancelExecution();
  const agentsQuery = useAgents();
  const { state: sidebarState, isMobile } = useSidebar();

  /** Match main content horizontal inset (sidebar + p-6) so the bar centers over the table column, not the viewport. */
  const bulkContentInset = useMemo(() => {
    const pad = "1.5rem";
    if (isMobile) {
      return { left: pad, right: pad } as const;
    }
    const w =
      sidebarState === "collapsed" ? "var(--sidebar-width-icon)" : "var(--sidebar-width)";
    return { left: `calc(${w} + ${pad})`, right: pad } as const;
  }, [isMobile, sidebarState]);

  // filter state
  const [timeRange, setTimeRange] = useState("all");
  /** Empty set = all statuses (no restriction). */
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => new Set());
  /** Empty set = all agents (no restriction). */
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const statusFilterKey = useMemo(
    () => [...selectedStatuses].sort().join("\0"),
    [selectedStatuses],
  );
  const agentFilterKey = useMemo(
    () => [...selectedAgents].sort().join("\0"),
    [selectedAgents],
  );

  /** Single status only: server-side filter. Multiple: fetch unfiltered by status, narrow client-side. */
  const apiStatus =
    selectedStatuses.size === 1 ? [...selectedStatuses][0] : undefined;

  // sort state
  const [sortBy, setSortBy] = useState("latest_activity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // pagination state (server-backed; default 25 rows — common for ops dashboards)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // debounce search input
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // reset pagination when filters/sort change
  const prevFiltersRef = useRef({
    timeRange,
    statusFilterKey,
    agentFilterKey,
    debouncedSearch,
    sortBy,
    sortOrder,
  });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.timeRange !== timeRange ||
      prev.statusFilterKey !== statusFilterKey ||
      prev.agentFilterKey !== agentFilterKey ||
      prev.debouncedSearch !== debouncedSearch ||
      prev.sortBy !== sortBy ||
      prev.sortOrder !== sortOrder
    ) {
      setPage(1);
      prevFiltersRef.current = {
        timeRange,
        statusFilterKey,
        agentFilterKey,
        debouncedSearch,
        sortBy,
        sortOrder,
      };
    }
  }, [
    timeRange,
    statusFilterKey,
    agentFilterKey,
    debouncedSearch,
    sortBy,
    sortOrder,
  ]);

  const filters = useMemo(
    () => ({
      timeRange: timeRange === "all" ? undefined : timeRange,
      status: apiStatus,
      search: debouncedSearch || undefined,
      page,
      pageSize,
      sortBy,
      sortOrder,
    }),
    [timeRange, apiStatus, debouncedSearch, page, pageSize, sortBy, sortOrder],
  );

  const { data, isLoading, isFetching, isError, error } = useRuns(filters);

  const pageRows = useMemo(() => data?.workflows ?? [], [data?.workflows]);
  const totalCount = data?.total_count ?? 0;
  const totalPages = Math.max(0, data?.total_pages ?? 0);
  const loadingInitial = isLoading && !data;

  // Reset to page 1 when page size changes (avoid landing past last page).
  const prevPageSize = useRef(pageSize);
  useEffect(() => {
    if (prevPageSize.current !== pageSize) {
      prevPageSize.current = pageSize;
      setPage(1);
    }
  }, [pageSize]);

  // Registered agents (stable filter list; not tied to the current result page).
  const agentMultiOptions = useMemo(() => {
    const nodes = agentsQuery.data?.nodes ?? [];
    return [...nodes]
      .map((n) => n.id)
      .filter(Boolean)
      .sort()
      .map((id) => ({ value: id, label: id }));
  }, [agentsQuery.data?.nodes]);

  const statusMultiOptions = useMemo(
    () =>
      FILTER_STATUS_CANONICAL.map((canonical) => ({
        value: canonical,
        label: getStatusLabel(canonical),
        leading: <StatusMenuDot canonical={canonical} />,
      })),
    [],
  );

  const hasActiveFilters =
    timeRange !== "all" ||
    selectedStatuses.size > 0 ||
    selectedAgents.size > 0 ||
    search.trim() !== "" ||
    debouncedSearch.trim() !== "";

  const clearAllFilters = useCallback(() => {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    setTimeRange("all");
    setSelectedStatuses(new Set());
    setSelectedAgents(new Set());
    setSearch("");
    setDebouncedSearch("");
    setSelected(new Set());
    setPage(1);
  }, []);

  const handleStatusesFilterChange = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setSelectedStatuses(updater);
    },
    [],
  );

  const handleAgentsFilterChange = useCallback(
    (updater: (prev: Set<string>) => Set<string>) => {
      setSelectedAgents(updater);
      setSelected(new Set());
    },
    [],
  );

  /** Server applies status when exactly one is selected; otherwise narrow here (multi-status OR, agents OR). */
  const filteredRuns = useMemo(() => {
    let rows = pageRows;
    if (selectedStatuses.size > 1) {
      rows = rows.filter((r) =>
        selectedStatuses.has(normalizeExecutionStatus(r.status)),
      );
    }
    if (selectedAgents.size > 0) {
      rows = rows.filter((r) => {
        const id = r.agent_id || r.agent_name;
        return id != null && selectedAgents.has(id);
      });
    }
    return rows;
  }, [pageRows, selectedStatuses, selectedAgents]);

  // row click
  const handleRowClick = useCallback(
    (run: WorkflowSummary) => {
      navigate(`/runs/${run.run_id}`);
    },
    [navigate],
  );

  // checkbox selection
  const toggleSelect = useCallback(
    (runId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(runId)) {
          next.delete(runId);
        } else {
          next.add(runId);
        }
        return next;
      });
    },
    [],
  );

  const toggleSelectAll = useCallback(() => {
    if (selected.size === filteredRuns.length && filteredRuns.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredRuns.map((r) => r.run_id)));
    }
  }, [filteredRuns, selected.size]);

  const allSelected =
    filteredRuns.length > 0 && selected.size === filteredRuns.length;
  const someSelected = selected.size > 0 && !allSelected;

  const handleFilterChange = useCallback(
    (setter: (v: string) => void) => (value: string) => {
      setter(value);
      setPage(1);
    },
    [],
  );

  // sortable header click handler
  const handleSortClick = useCallback(
    (column: string) => {
      if (sortBy === column) {
        setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(column);
        setSortOrder("desc");
      }
      setPage(1);
    },
    [sortBy],
  );

  // sortable header sub-component
  const SortableHead = useCallback(
    ({ column, label, className }: { column: string; label: string; className?: string }) => {
      const active = sortBy === column;
      return (
        <TableHead
          className={cn(
            "h-8 px-3 text-[11px] font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors",
            className,
          )}
          onClick={() => handleSortClick(column)}
        >
          <div className="flex items-center gap-1">
            {label}
            {active ? (
              sortOrder === "asc" ? (
                <ArrowUp className="size-3 text-foreground" />
              ) : (
                <ArrowDown className="size-3 text-foreground" />
              )
            ) : (
              <ArrowUpDown className="size-3 opacity-30" />
            )}
          </div>
        </TableHead>
      );
    },
    [sortBy, sortOrder, handleSortClick],
  );

  return (
    <div className={cn("space-y-3", selected.size > 0 && "pb-24")}>
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
      </div>

      {/* Filter toolbar — combobox + cmdk search pattern (shadcn) */}
      <Card variant="surface" interactive={false} className="mb-3 shadow-sm">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Run filters"
          >
            <FilterCombobox
              label="Time range"
              placeholder="Time range"
              searchPlaceholder="Search ranges…"
              options={TIME_OPTIONS}
              value={timeRange}
              onValueChange={handleFilterChange(setTimeRange)}
            />
            <FilterMultiCombobox
              label="Status"
              emptyLabel="All statuses"
              searchPlaceholder="Search statuses…"
              emptyMessage="No status matches."
              options={statusMultiOptions}
              selected={selectedStatuses}
              onSelectedChange={handleStatusesFilterChange}
              pluralLabel={(n) => `${n} statuses`}
            />
            <FilterMultiCombobox
              label="Agents"
              emptyLabel="All agents"
              searchPlaceholder="Find agents…"
              emptyMessage={
                agentMultiOptions.length === 0
                  ? "No registered agents yet."
                  : "No agent matches."
              }
              options={agentMultiOptions}
              selected={selectedAgents}
              onSelectedChange={handleAgentsFilterChange}
              pluralLabel={(n) => `${n} agents`}
            />
          </div>

          <Separator
            orientation="vertical"
            className="hidden h-9 bg-border sm:block sm:shrink-0"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <SearchBar
              size="sm"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search runs, reasoners, agents…"
              aria-label="Search runs"
              wrapperClassName="min-w-0 flex-1 w-full sm:max-w-md"
              inputClassName="w-full bg-background/80"
            />
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <RunsPaginationBar
        placement="top"
        totalCount={totalCount}
        totalPages={totalPages}
        page={page}
        pageSize={pageSize}
        pageRowCount={pageRows.length}
        isFetching={isFetching}
        setPage={setPage}
        setPageSize={setPageSize}
      />

      {/* Table */}
      <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          "rounded-lg border border-border bg-card transition-opacity",
          isFetching && "opacity-[0.72]",
        )}
      >
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              {/* Checkbox */}
              <TableHead className="h-8 w-10 px-3 text-[11px] font-medium text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  data-state={someSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              {/* Status first — most scannable */}
              <SortableHead column="status" label="Status" className="w-24" />
              {/* Target + short run id (full id via copy) */}
              <TableHead
                className="h-8 px-3 text-[11px] font-medium text-muted-foreground min-w-0"
                title="Hover the input/output icon next to a reasoner to preview input / output without leaving the list."
              >
                <span className="inline-flex items-center gap-1.5">
                  Target
                  <ArrowLeftRight
                    className="size-3 shrink-0 opacity-45"
                    aria-hidden
                  />
                </span>
              </TableHead>
              {/* Steps — complexity */}
              <SortableHead column="total_executions" label="Steps" className="w-20" />
              {/* Duration — performance */}
              <SortableHead column="duration_ms" label="Duration" className="w-24" />
              {/* Started — when (relative) */}
              <SortableHead column="latest_activity" label="Started" className="min-w-[9.5rem] w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInitial ? (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                  Loading runs…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="p-8 text-center text-destructive text-xs">
                  {error instanceof Error ? error.message : "Failed to load runs"}
                </TableCell>
              </TableRow>
            ) : filteredRuns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-8">
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Play className="size-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">No runs found</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {pageRows.length > 0 &&
                      (selectedStatuses.size > 0 || selectedAgents.size > 0)
                        ? "No rows match the current status or agent filters on this page. Try clearing filters or another page."
                        : timeRange !== "all"
                          ? "Try expanding the time range"
                          : "Execute a reasoner to create your first run"}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredRuns.map((run) => (
                <RunRow
                  key={run.run_id}
                  run={run}
                  isSelected={selected.has(run.run_id)}
                  onRowClick={handleRowClick}
                  onToggleSelect={toggleSelect}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>

      <RunsPaginationBar
        placement="bottom"
        totalCount={totalCount}
        totalPages={totalPages}
        page={page}
        pageSize={pageSize}
        pageRowCount={pageRows.length}
        isFetching={isFetching}
        setPage={setPage}
        setPageSize={setPageSize}
      />

      {/* Floating bulk bar: fixed strip matches main content width; card centered within that strip (over the table). */}
      {selected.size > 0 ? (
        <div
          className="pointer-events-none fixed z-50 flex justify-center"
          style={{
            ...bulkContentInset,
            bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <Card
            variant="default"
            interactive={false}
            className="pointer-events-auto w-full max-w-2xl border-border bg-card text-card-foreground shadow-lg"
            role="toolbar"
            aria-label="Bulk actions for selected runs"
          >
            <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <p
                className="text-center text-sm text-muted-foreground sm:text-left"
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="font-medium tabular-nums text-foreground">
                  {selected.size}
                </span>{" "}
                run{selected.size === 1 ? "" : "s"} selected
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                <Button
                  size="sm"
                  variant={selected.size === 2 ? "default" : "secondary"}
                  className="h-8 text-xs"
                  disabled={selected.size !== 2}
                  onClick={() => {
                    const ids = Array.from(selected);
                    if (ids.length === 2) {
                      navigate(`/runs/compare?a=${ids[0]}&b=${ids[1]}`);
                    }
                  }}
                >
                  Compare selected ({selected.size})
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 text-xs"
                  disabled={cancelMutation.isPending}
                  onClick={async () => {
                    for (const runId of selected) {
                      const run = filteredRuns.find((r) => r.run_id === runId);
                      if (
                        run?.root_execution_id &&
                        (run.status === "running" || run.status === "pending")
                      ) {
                        await cancelMutation.mutateAsync(run.root_execution_id);
                      }
                    }
                    setSelected(new Set());
                  }}
                >
                  Cancel running
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ─── row sub-component ────────────────────────────────────────────────────────

interface RunRowProps {
  run: WorkflowSummary;
  isSelected: boolean;
  onRowClick: (run: WorkflowSummary) => void;
  onToggleSelect: (runId: string, e: React.MouseEvent) => void;
}

function RunRow({ run, isSelected, onRowClick, onToggleSelect }: RunRowProps) {
  const agentLabel = run.agent_id || run.agent_name || "";
  const reasonerLabel = run.root_reasoner || run.display_name || "—";

  return (
    <TableRow
      className="cursor-pointer"
      data-state={isSelected ? "selected" : undefined}
      onClick={() => onRowClick(run)}
    >
      {/* Checkbox */}
      <TableCell className="px-3 py-1.5 w-10" onClick={(e) => onToggleSelect(run.run_id, e)}>
        <Checkbox
          checked={isSelected}
          aria-label={`Select run ${run.run_id}`}
          onCheckedChange={() => {}}
        />
      </TableCell>
      {/* Status dot */}
      <TableCell className="px-3 py-1.5 w-24">
        <StatusDot status={run.status} />
      </TableCell>
      {/* Target name, then inline copy-chip for run id (no sub-column) */}
      <TableCell
        className="px-3 py-1.5 min-w-0 max-w-[min(36rem,72vw)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <span
            className="inline-block min-w-0 max-w-[min(100%,20rem)] cursor-pointer truncate text-xs font-medium font-mono hover:underline hover:underline-offset-2"
            onClick={() => onRowClick(run)}
          >
            {agentLabel ? (
              <>
                <span className="text-muted-foreground">{agentLabel}.</span>
                <span>{reasonerLabel}</span>
              </>
            ) : (
              <span>{reasonerLabel}</span>
            )}
          </span>
          {run.root_execution_id ? (
            <HoverCard openDelay={180} closeDelay={80}>
              <HoverCardTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-transparent",
                    "text-muted-foreground/80 transition-colors",
                    "hover:border-border/80 hover:bg-muted/60 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  title="Preview input / output"
                  aria-label="Preview run input and output"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ArrowLeftRight className="size-3.5" strokeWidth={2} aria-hidden />
                </button>
              </HoverCardTrigger>
              <HoverCardContent
                className="w-[min(94vw,26rem)] overflow-hidden border-border/80 p-0 shadow-md"
                side="bottom"
                align="center"
                sideOffset={5}
              >
                <RunPreview rootExecutionId={run.root_execution_id} />
              </HoverCardContent>
            </HoverCard>
          ) : null}
          <button
            type="button"
            className={cn(
              badgeVariants({ variant: "metadata", size: "sm" }),
              "h-6 shrink-0 cursor-pointer gap-1 rounded-full border-border/70 px-2 py-0 font-mono tabular-nums",
              "text-muted-foreground transition-colors hover:border-border hover:bg-muted/70 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            title={run.run_id}
            aria-label={`Copy run ID ${run.run_id}`}
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(run.run_id);
            }}
          >
            <span>{shortRunIdDisplay(run.run_id)}</span>
            <Copy className="size-3 shrink-0 opacity-60" aria-hidden />
          </button>
        </div>
      </TableCell>
      {/* Steps */}
      <TableCell className="px-3 py-1.5 text-xs tabular-nums w-20">
        {run.total_executions ?? 1}
      </TableCell>
      {/* Duration */}
      <TableCell className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground w-24">
        {formatDuration(run.duration_ms, run.terminal)}
      </TableCell>
      {/* Started — relative + absolute; live seconds for running */}
      <TableCell
        className="px-3 py-1.5 min-w-[9.5rem] w-44 align-top"
        onClick={(e) => e.stopPropagation()}
      >
        <StartedAtCell run={run} />
      </TableCell>
    </TableRow>
  );
}
