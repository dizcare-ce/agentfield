import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getWorkflowsSummary } from "../../services/workflowsApi";
import type { WorkflowsResponse } from "../../types/workflows";

export interface RunsFilters {
  timeRange?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  session?: string;
  actor?: string;
  workflow?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** When set, polls the runs list (e.g. dashboard while workflows are active). */
  refetchInterval?: number | false;
}

export function useRuns(filters: RunsFilters = {}) {
  const {
    timeRange,
    status,
    page = 1,
    pageSize = 50,
    search,
    session,
    actor,
    workflow,
    sortBy = "latest_activity",
    sortOrder = "desc",
    refetchInterval = false,
  } = filters;

  return useQuery<WorkflowsResponse>({
    queryKey: ["runs", filters],
    placeholderData: keepPreviousData,
    refetchInterval,
    queryFn: () =>
      getWorkflowsSummary(
        {
          ...(status && status !== "all" ? { status } : {}),
          ...(timeRange && timeRange !== "all" ? { timeRange } : {}),
          ...(search ? { search } : {}),
          ...(session ? { session } : {}),
          ...(actor ? { actor_id: actor } : {}),
          ...(workflow ? { workflow } : {}),
        },
        page,
        pageSize,
        sortBy,
        sortOrder,
      ),
  });
}
