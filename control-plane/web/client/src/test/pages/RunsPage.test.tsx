import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunsPage } from "@/pages/RunsPage";
import type { WorkflowSummary } from "@/types/workflows";

const runsState = vi.hoisted(() => ({
  clipboardWriteText: vi.fn<(value: string) => Promise<void>>(),
  navigate: vi.fn<(value: string) => void>(),
  cancelMutateAsync: vi.fn<(executionId: string) => Promise<unknown>>(),
  pauseMutateAsync: vi.fn<(executionId: string) => Promise<unknown>>(),
  resumeMutateAsync: vi.fn<(executionId: string) => Promise<unknown>>(),
  showSuccess: vi.fn<(message: string) => void>(),
  showError: vi.fn<(message: string, details?: string) => void>(),
  showWarning: vi.fn<(message: string) => void>(),
  showRunNotification: vi.fn<(message: string) => void>(),
  search: "",
  isError: false,
  error: null as Error | null,
  previewByExecutionId: {} as Record<string, { input_data?: unknown; output_data?: unknown }>,
  runs: [] as WorkflowSummary[],
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => runsState.navigate,
  useSearchParams: () => [new URLSearchParams(runsState.search)],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    const executionId = String(queryKey[1]);
    return {
      data: runsState.previewByExecutionId[executionId] ?? null,
      isLoading: false,
    };
  },
}));

vi.mock("@/components/ui/notification", () => ({
  useSuccessNotification: () => runsState.showSuccess,
  useErrorNotification: () => runsState.showError,
  useWarningNotification: () => runsState.showWarning,
  useRunNotification: () => runsState.showRunNotification,
}));

vi.mock("@/hooks/queries", async () => {
  const statusUtils = await import("@/utils/status");

  return {
    useRuns: (filters: {
      search?: string;
      status?: string;
    }) => {
      const normalizedSearch = filters.search?.trim().toLowerCase() ?? "";
      const normalizedStatus = filters.status
        ? statusUtils.normalizeExecutionStatus(filters.status)
        : undefined;

      const workflows = runsState.runs.filter((run) => {
        if (
          normalizedStatus &&
          statusUtils.normalizeExecutionStatus(run.status) !== normalizedStatus
        ) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return [
          run.run_id,
          run.root_reasoner,
          run.display_name,
          run.agent_id,
          run.agent_name,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));
      });

      return {
        data: runsState.isError
          ? undefined
          : {
              workflows,
              total_count: workflows.length,
              page: 1,
              page_size: 25,
              total_pages: workflows.length > 0 ? 1 : 0,
            },
        isLoading: false,
        isFetching: false,
        isError: runsState.isError,
        error: runsState.error,
      };
    },
    useCancelExecution: () => ({
      mutateAsync: runsState.cancelMutateAsync,
      isPending: false,
    }),
    usePauseExecution: () => ({
      mutateAsync: runsState.pauseMutateAsync,
      isPending: false,
    }),
    useResumeExecution: () => ({
      mutateAsync: runsState.resumeMutateAsync,
      isPending: false,
    }),
  };
});

vi.mock("@/components/ui/table", () => ({
  Table: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableElement>>) => (
    <table {...props}>{children}</table>
  ),
  TableHeader: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableSectionElement>>) => (
    <thead {...props}>{children}</thead>
  ),
  TableBody: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableSectionElement>>) => (
    <tbody {...props}>{children}</tbody>
  ),
  TableRow: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLTableRowElement>>) => (
    <tr {...props}>{children}</tr>
  ),
  TableHead: ({ children, ...props }: React.PropsWithChildren<React.ThHTMLAttributes<HTMLTableCellElement>>) => (
    <th {...props}>{children}</th>
  ),
  TableCell: ({ children, ...props }: React.PropsWithChildren<React.TdHTMLAttributes<HTMLTableCellElement>>) => (
    <td {...props}>{children}</td>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  buttonVariants: () => "button",
}));

vi.mock("@/components/ui/badge", () => ({
  badgeVariants: () => "badge",
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={!!checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({
    children,
    interactive: _interactive,
    variant: _variant,
    ...props
  }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement> & {
    interactive?: boolean;
    variant?: string;
  }>) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/filter-combobox", () => ({
  FilterCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("@/components/ui/filter-multi-combobox", () => ({
  FilterMultiCombobox: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("@/components/ui/SearchBar", () => ({
  SearchBar: ({
    value,
    onChange,
    placeholder,
    wrapperClassName: _wrapperClassName,
    inputClassName: _inputClassName,
    ...props
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    wrapperClassName?: string;
    inputClassName?: string;
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
}));

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  HoverCardTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  HoverCardContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  Tooltip: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TooltipContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>loading</div>,
}));

vi.mock("@/components/ui/pagination", () => ({
  Pagination: ({ children }: React.PropsWithChildren) => <nav>{children}</nav>,
  PaginationContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  PaginationItem: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  PaginationEllipsis: () => <span>…</span>,
  PaginationLink: ({
    children,
    onClick,
    isActive: _isActive,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement> & {
    isActive?: boolean;
  }>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  PaginationPrevious: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Previous</button>
  ),
  PaginationNext: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Next</button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLButtonElement>>) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: () => <span>value</span>,
  SelectContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SelectItem: ({ children }: React.PropsWithChildren<{ value: string }>) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ state: "expanded", isMobile: false }),
}));

vi.mock("@/components/ui/CompactTable", () => ({
  SortableHeaderCell: ({
    label,
    field,
    onSortChange,
  }: {
    label: string;
    field: string;
    onSortChange: (field: string) => void;
  }) => (
    <button type="button" onClick={() => onSortChange(field)}>
      {label}
    </button>
  ),
}));

vi.mock("@/components/ui/json-syntax-highlight", () => ({
  JsonHighlightedPre: ({ text, ...props }: { text: string } & React.HTMLAttributes<HTMLPreElement>) => (
    <pre {...props}>{text}</pre>
  ),
  formatTruncatedFormattedJson: (value: unknown, _maxLength?: number) => JSON.stringify(value, null, 2),
}));

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  const Icon = ({ className }: { className?: string }) => <span className={className}>icon</span>;
  return {
    ...actual,
    ArrowDown: Icon,
    ArrowLeftRight: Icon,
    ArrowUp: Icon,
    Check: Icon,
    Copy: Icon,
    Play: Icon,
  };
});

vi.mock("@/services/executionsApi", () => ({
  getExecutionDetails: vi.fn(),
}));

function createRun(overrides: Partial<WorkflowSummary>): WorkflowSummary {
  return {
    run_id: "run-1-long-id",
    workflow_id: "run-1-long-id",
    root_execution_id: "exec-1",
    status: "running",
    root_reasoner: "summarize_document",
    current_task: "summarize_document",
    total_executions: 3,
    max_depth: 2,
    started_at: "2026-04-07T10:00:00Z",
    latest_activity: "2026-04-07T10:05:00Z",
    duration_ms: 12000,
    display_name: "summarize_document",
    agent_id: "agent.alpha",
    agent_name: "agent.alpha",
    status_counts: { running: 1, succeeded: 2 },
    active_executions: 1,
    terminal: false,
    ...overrides,
  };
}

describe("RunsPage", () => {
  beforeEach(() => {
    runsState.search = "";
    runsState.isError = false;
    runsState.error = null;
    runsState.navigate.mockReset();
    runsState.cancelMutateAsync.mockReset();
    runsState.pauseMutateAsync.mockReset();
    runsState.resumeMutateAsync.mockReset();
    runsState.showSuccess.mockReset();
    runsState.showError.mockReset();
    runsState.showWarning.mockReset();
    runsState.showRunNotification.mockReset();
    runsState.clipboardWriteText.mockReset();
    runsState.clipboardWriteText.mockResolvedValue();
    runsState.runs = [
      createRun({ run_id: "run-1-long-id", root_execution_id: "exec-1", status: "running" }),
      createRun({
        run_id: "run-2-long-id",
        workflow_id: "run-2-long-id",
        root_execution_id: "exec-2",
        status: "pending",
        agent_id: "agent.beta",
        agent_name: "agent.beta",
        root_reasoner: "draft_email",
        display_name: "draft_email",
      }),
    ];
    runsState.previewByExecutionId = {
      "exec-1": { input_data: { prompt: "hello" }, output_data: { result: "world" } },
      "exec-2": { input_data: { task: "draft" }, output_data: { result: "email" } },
    };

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: runsState.clipboardWriteText },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders runs, previews payloads, and supports selection bulk actions", async () => {
    render(<RunsPage />);

    expect(screen.getByText("Runs")).toBeInTheDocument();
    expect(screen.getByText("summarize_document")).toBeInTheDocument();
    expect(screen.getByText("draft_email")).toBeInTheDocument();
    expect(
      screen.getAllByRole("region", { name: /Input and output preview/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Open run for full JSON and trace/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByLabelText(/Select run /i)[0]);
    fireEvent.click(screen.getAllByLabelText(/Select run /i)[1]);

    expect(screen.getByRole("toolbar", { name: /Bulk actions for selected runs/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Compare selected \(2\)/i }));
    expect(runsState.navigate).toHaveBeenCalledWith(
      "/runs/compare?a=run-1-long-id&b=run-2-long-id",
    );

    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel 2 runs/i }));
    await waitFor(() => {
      expect(runsState.cancelMutateAsync).toHaveBeenCalledWith("exec-1");
      expect(runsState.cancelMutateAsync).toHaveBeenCalledWith("exec-2");
    });

    fireEvent.click(screen.getByRole("button", { name: /Copy run ID run-1-long-id/i }));
    expect(runsState.clipboardWriteText).toHaveBeenCalledWith("run-1-long-id");

    fireEvent.click(screen.getAllByRole("link")[0]);
    expect(runsState.navigate).toHaveBeenCalledWith("/runs/run-1-long-id");
  });

  it("applies server-side status query filters and debounced search", async () => {
    runsState.search = "status=running";
    render(<RunsPage />);

    expect(screen.getByText("summarize_document")).toBeInTheDocument();
    expect(screen.queryByText("draft_email")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear filters/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: /Search runs/i }), {
      target: { value: "missing-run" },
    });

    await waitFor(
      () => {
        expect(screen.getByText("No runs found")).toBeInTheDocument();
      },
      { timeout: 1000 },
    );

    fireEvent.click(screen.getByRole("button", { name: /Clear filters/i }));
    await waitFor(() => {
      expect(screen.getByText("draft_email")).toBeInTheDocument();
    });
  });

  it("shows error state when the runs query fails", () => {
    runsState.isError = true;
    runsState.error = new Error("runs unavailable");

    render(<RunsPage />);

    expect(screen.getByText("runs unavailable")).toBeInTheDocument();
  });
});
