import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useRuns, useCancelExecution } from "@/hooks/queries";
import type { WorkflowSummary } from "@/types/workflows";
import { normalizeExecutionStatus } from "@/utils/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function RunStatusBadge({ status }: { status: string }) {
  const canonical = normalizeExecutionStatus(status);
  const variant =
    canonical === "failed" || canonical === "timeout"
      ? "destructive"
      : canonical === "succeeded"
        ? "default"
        : "secondary";

  const label =
    canonical === "succeeded"
      ? "succeeded"
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

  return <Badge variant={variant}>{label}</Badge>;
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

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
  { value: "pending", label: "Pending" },
];

const PAGE_SIZE = 50;

// ─── main component ────────────────────────────────────────────────────────────

export function RunsPage() {
  const navigate = useNavigate();
  const cancelMutation = useCancelExecution();

  // filter state
  const [timeRange, setTimeRange] = useState("all");
  const [status, setStatus] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // pagination state
  const [page, setPage] = useState(1);
  const [allRuns, setAllRuns] = useState<WorkflowSummary[]>([]);

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
      setAllRuns([]);
    }, 300);
  }, []);

  // reset pagination when filters change
  const prevFiltersRef = useRef({ timeRange, status, debouncedSearch });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.timeRange !== timeRange ||
      prev.status !== status ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      setPage(1);
      setAllRuns([]);
      prevFiltersRef.current = { timeRange, status, debouncedSearch };
    }
  }, [timeRange, status, debouncedSearch]);

  const filters = useMemo(
    () => ({
      timeRange: timeRange === "all" ? undefined : timeRange,
      status: status === "all" ? undefined : status,
      search: debouncedSearch || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [timeRange, status, debouncedSearch, page],
  );

  const { data, isLoading, isFetching, isError, error } = useRuns(filters);

  // accumulate pages
  useEffect(() => {
    if (!data?.workflows) return;
    if (page === 1) {
      setAllRuns(data.workflows);
    } else {
      setAllRuns((prev) => {
        const existingIds = new Set(prev.map((r) => r.run_id));
        const newRuns = data.workflows.filter((r) => !existingIds.has(r.run_id));
        return [...prev, ...newRuns];
      });
    }
  }, [data, page]);

  const hasMore = data?.has_more ?? false;
  const loadingInitial = isLoading && page === 1;
  const loadingMore = isFetching && page > 1;

  // derive unique agent IDs for the agent filter
  const agentIds = useMemo(() => {
    const ids = new Set(
      allRuns.map((r) => r.agent_id || r.agent_name).filter(Boolean) as string[],
    );
    return Array.from(ids).sort();
  }, [allRuns]);

  // apply agent filter client-side
  const filteredRuns = useMemo(() => {
    if (agentFilter === "all") return allRuns;
    return allRuns.filter(
      (r) => (r.agent_id || r.agent_name) === agentFilter,
    );
  }, [allRuns, agentFilter]);

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
      setAllRuns([]);
    },
    [],
  );

  return (
    <div className="space-y-3">
      {/* Page heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Runs</h1>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <Select
          value={timeRange}
          onValueChange={handleFilterChange(setTimeRange)}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Time range" />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={handleFilterChange(setStatus)}
        >
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={agentFilter}
          onValueChange={(v) => {
            setAgentFilter(v);
            setSelected(new Set());
          }}
        >
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              All agents
            </SelectItem>
            {agentIds.map((id) => (
              <SelectItem key={id} value={id} className="text-xs">
                {id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search by run ID or reasoner…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 pb-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={selected.size !== 2}
            onClick={() => {
              const ids = Array.from(selected);
              if (ids.length === 2) {
                navigate(`/runs/compare?a=${ids[0]}&b=${ids[1]}`);
              }
            }}
          >
            Compare Selected ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs text-destructive hover:text-destructive"
            disabled={cancelMutation.isPending}
            onClick={async () => {
              for (const runId of selected) {
                const run = allRuns.find((r) => r.run_id === runId);
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
            Cancel Running
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border bg-card">
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="h-8 w-10 px-3 text-[11px] font-medium text-muted-foreground">
                <Checkbox
                  checked={allSelected}
                  data-state={someSelected ? "indeterminate" : undefined}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="h-8 px-3 text-[11px] font-medium text-muted-foreground">
                Run ID
              </TableHead>
              <TableHead className="h-8 px-3 text-[11px] font-medium text-muted-foreground">
                Root Reasoner
              </TableHead>
              <TableHead className="h-8 px-3 text-[11px] font-medium text-muted-foreground">
                Steps
              </TableHead>
              <TableHead className="h-8 px-3 text-[11px] font-medium text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-8 px-3 text-[11px] font-medium text-muted-foreground">
                Duration
              </TableHead>
              <TableHead className="h-8 px-3 text-[11px] font-medium text-muted-foreground">
                Started
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingInitial ? (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-muted-foreground text-xs">
                  Loading runs…
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-destructive text-xs">
                  {error instanceof Error ? error.message : "Failed to load runs"}
                </TableCell>
              </TableRow>
            ) : filteredRuns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-8 text-center text-muted-foreground text-xs">
                  No runs found
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

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-8"
            disabled={loadingMore}
            onClick={() => setPage((p) => p + 1)}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
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
  const shortId = run.run_id.length > 12 ? run.run_id.slice(0, 12) + "…" : run.run_id;

  const startedAt = run.started_at
    ? new Date(run.started_at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <TableRow
      className="cursor-pointer"
      data-state={isSelected ? "selected" : undefined}
      onClick={() => onRowClick(run)}
    >
      <TableCell className="px-3 py-1.5 w-10" onClick={(e) => onToggleSelect(run.run_id, e)}>
        <Checkbox
          checked={isSelected}
          aria-label={`Select run ${run.run_id}`}
          onCheckedChange={() => {}}
        />
      </TableCell>
      <TableCell className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
        {shortId}
      </TableCell>
      <TableCell className="px-3 py-1.5 text-xs font-medium">
        {run.root_reasoner || run.display_name || "—"}
      </TableCell>
      <TableCell className="px-3 py-1.5 text-xs tabular-nums">
        {run.total_executions ?? 1}
      </TableCell>
      <TableCell className="px-3 py-1.5">
        <RunStatusBadge status={run.status} />
      </TableCell>
      <TableCell className="px-3 py-1.5 text-xs tabular-nums text-muted-foreground">
        {formatDuration(run.duration_ms, run.terminal)}
      </TableCell>
      <TableCell className="px-3 py-1.5 text-[11px] text-muted-foreground">
        {startedAt}
      </TableCell>
    </TableRow>
  );
}
