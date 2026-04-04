
// ─── failures: production-style attention ─────────────────────────────────────

interface FailuresAttentionProps {
  failures: WorkflowSummary[];
  topFailingReasoners: [string, number][];
  onOpenRun: (runId: string) => void;
  onViewAllRuns: () => void;
}

function FailuresAttention({
  failures,
  topFailingReasoners,
  onOpenRun,
  onViewAllRuns,
}: FailuresAttentionProps) {
  if (failures.length === 0) return null;

  const preview = failures.slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-base font-semibold">Needs attention</CardTitle>
          <CardDescription>
            Failed or timed-out runs in the recent window. Open one to inspect errors in the DAG.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={onViewAllRuns}
        >
          All runs
          <ArrowRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {topFailingReasoners.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {topFailingReasoners.map(([name, count]) => (
              <Badge key={name} variant="outline" className="font-normal">
                <span className="max-w-[12rem] truncate">{name}</span>
                <span className="ml-1.5 tabular-nums text-muted-foreground">{count}</span>
              </Badge>
            ))}
          </div>
        ) : null}
        <ul className="space-y-2">
          {preview.map((run) => (
            <li
              key={`${run.run_id}-${run.started_at}-fail`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="font-mono text-xs text-muted-foreground"
                    title={run.run_id}
                  >
                    {shortRunId(run.run_id)}
                  </span>
                  <RunStatusBadge status={run.status} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {run.root_reasoner || run.display_name || "—"} ·{" "}
                  {formatRelativeTime(run.latest_activity)}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onOpenRun(run.run_id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── recent runs table (secondary) ───────────────────────────────────────────

interface RecentRunsTableProps {
  runs: WorkflowSummary[];
  loading: boolean;
  onRowClick: (runId: string) => void;
}

function RecentRunsTable({ runs, loading, onRowClick }: RecentRunsTableProps) {
  if (loading) {
    return (
      <div className="space-y-1.5 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <CheckCircle className="mb-2 size-7 opacity-40" />
        <p className="text-xs">No runs yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-8 w-[110px] px-3 text-xs">Run</TableHead>
          <TableHead className="h-8 px-3 text-xs">Reasoner</TableHead>
          <TableHead className="h-8 w-[60px] px-3 text-right text-xs">Steps</TableHead>
          <TableHead className="h-8 w-[100px] px-3 text-xs">Status</TableHead>
          <TableHead className="h-8 w-[80px] px-3 text-right text-xs">Duration</TableHead>
          <TableHead className="h-8 w-[90px] px-3 text-right text-xs">Started</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow
            key={`${run.run_id}-${run.started_at}`}
            className="cursor-pointer"
            onClick={() => onRowClick(run.run_id)}
          >
            <TableCell className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
              <span title={run.run_id}>{shortRunId(run.run_id)}</span>
            </TableCell>
            <TableCell className="max-w-[200px] truncate px-3 py-1.5 text-xs font-medium">
              {run.root_reasoner || run.display_name || "—"}
            </TableCell>
            <TableCell className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
              {run.total_executions ?? "—"}
            </TableCell>
            <TableCell className="px-3 py-1.5">
              <RunStatusBadge status={run.status} />
            </TableCell>
            <TableCell className="px-3 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums">
              {run.terminal ? (
                formatDurationHumanReadable(run.duration_ms)
              ) : (
                <LiveElapsedDuration
                  startedAt={run.started_at}
                  className="text-muted-foreground"
                />
              )}
            </TableCell>
            <TableCell className="px-3 py-1.5 text-right text-xs text-muted-foreground">
              {formatRelativeTime(run.started_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export function NewDashboardPage() {
  const navigate = useNavigate();

  const runsQuery = useRuns({
    timeRange: "all",
    pageSize: 100,
    sortBy: "latest_activity",
    sortOrder: "desc",
    refetchInterval: 8_000,
  });

  const llmHealthQuery = useLLMHealth();
  const queueQuery = useQueueStatus();
  const agentsQuery = useAgents();

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: getDashboardSummary,
    refetchInterval: 30_000,
  });

  const unhealthyEndpoints =
    llmHealthQuery.data?.endpoints
      ?.filter((ep) => !ep.healthy)
      .map((ep) => ep.name) ?? [];

  const overloadedAgents = Object.entries(queueQuery.data?.agents ?? {})
    .filter(([, s]) => s.running >= s.max_concurrent && s.max_concurrent > 0)
    .map(([name]) => name);

  const hasIssues = unhealthyEndpoints.length > 0 || overloadedAgents.length > 0;

  const totalRuns = summaryQuery.data?.executions?.today ?? runsQuery.data?.total_count;
  const successRate = summaryQuery.data?.success_rate;
  const agentsOnline =
    agentsQuery.data?.nodes?.filter(
      (n: AgentNodeSummary) => n.health_status === "ready" || n.health_status === "active",
    ).length ??
    agentsQuery.data?.count ??
    summaryQuery.data?.agents?.running;

  const recentRuns = runsQuery.data?.workflows ?? [];

  const { active, latestCompleted, failures, topFailingReasoners } = useMemo(
    () => partitionDashboardRuns(recentRuns),
    [recentRuns],
  );

  const avgDuration = useMemo(() => {
    const completed = recentRuns.filter((r) => r.duration_ms != null && r.terminal);
    if (completed.length === 0) return null;
    const avg =
      completed.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0) / completed.length;
    return formatDurationHumanReadable(avg);
  }, [recentRuns]);

  const statsLoading =
    (summaryQuery.isLoading && runsQuery.isLoading) || agentsQuery.isLoading;

  const tablePreviewRuns = useMemo(() => recentRuns.slice(0, 8), [recentRuns]);

  return (
    <div className="flex flex-col gap-6">
      {hasIssues && (
        <IssuesBanner
          llmHealthLoading={llmHealthQuery.isLoading}
          unhealthyEndpoints={unhealthyEndpoints}
          queueOverloaded={overloadedAgents.length > 0}
          overloadedAgents={overloadedAgents}
        />
      )}

      <PrimaryRunFocus
        loading={runsQuery.isLoading}
        active={active}
        latestCompleted={latestCompleted}
        onOpenRun={(runId) => navigate(`/runs/${runId}`)}
        onViewRunsList={() => navigate("/runs")}
      />

      <FailuresAttention
        failures={failures}
        topFailingReasoners={topFailingReasoners}
        onOpenRun={(runId) => navigate(`/runs/${runId}`)}
        onViewAllRuns={() => navigate("/runs")}
      />

      {statsLoading ? (
        <div className="flex flex-wrap items-center gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">{totalRuns ?? "—"}</span>
            <span className="text-muted-foreground">runs today</span>
          </div>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">
              {successRate != null ? `${(successRate * 100).toFixed(0)}%` : "—"}
            </span>
            <span className="text-muted-foreground">success</span>
          </div>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">{agentsOnline ?? "—"}</span>
            <span className="text-muted-foreground">agents online</span>
          </div>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <div className="flex items-center gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">{avgDuration ?? "—"}</span>
            <span className="text-muted-foreground">avg time</span>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-4 py-3">
          <CardTitle className="text-sm font-medium">Recent runs</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => navigate("/runs")}
          >
            View all
            <ArrowRight className="size-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <RecentRunsTable
            runs={tablePreviewRuns}
            loading={runsQuery.isLoading}
            onRowClick={(runId) => navigate(`/runs/${runId}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
