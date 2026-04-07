import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeDetailPage } from "@/pages/NodeDetailPage";
import type {
  AgentNodeDetailsForUIWithPackage,
  AgentStatus,
  MCPHealthResponseModeAware,
} from "@/types/agentfield";

const pageState = vi.hoisted(() => ({
  nodeId: "agent-alpha",
  hash: "",
  mode: "developer",
  navigate: vi.fn<(value: number | string, options?: unknown) => void>(),
  showSuccess: vi.fn<(message: string) => void>(),
  showError: vi.fn<(message: string, details?: string) => void>(),
  showInfo: vi.fn<(message: string) => void>(),
  getNodeDetailsWithPackageInfo: vi.fn<
    (nodeId: string, mode: string) => Promise<AgentNodeDetailsForUIWithPackage>
  >(),
  getMCPHealthModeAware: vi.fn<(nodeId: string, mode: string) => Promise<MCPHealthResponseModeAware>>(),
  getMCPServerMetrics: vi.fn<(nodeId: string) => Promise<unknown>>(),
  getNodeStatus: vi.fn<(nodeId: string) => Promise<AgentStatus>>(),
  startAgent: vi.fn<(nodeId: string) => Promise<unknown>>(),
  stopAgent: vi.fn<(nodeId: string) => Promise<unknown>>(),
  reconcileAgent: vi.fn<(nodeId: string) => Promise<unknown>>(),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ nodeId: pageState.nodeId }),
  useNavigate: () => pageState.navigate,
  useLocation: () => ({ pathname: `/nodes/${pageState.nodeId}`, hash: pageState.hash }),
}));

vi.mock("@/contexts/ModeContext", () => ({
  useMode: () => ({ mode: pageState.mode }),
}));

vi.mock("@/components/AccessibilityEnhancements", () => ({
  MCPAccessibilityProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ErrorAnnouncer: ({ error }: { error: string }) => <div>{error}</div>,
  StatusAnnouncer: ({ status }: { status: string }) => <div>{status}</div>,
  useAccessibility: () => ({ announceStatus: vi.fn() }),
}));

vi.mock("@/hooks/useDIDInfo", () => ({
  useDIDInfo: () => ({
    didInfo: {
      did: "did:af:agent-alpha",
      reasoners: [{ did: "did:af:reasoner" }],
      skills: [{ did: "did:af:skill" }],
    },
  }),
}));

vi.mock("@/hooks/useSSE", () => ({
  useMCPHealthSSE: () => ({ latestEvent: null }),
  useNodeUnifiedStatusSSE: () => ({ latestEvent: null }),
}));

vi.mock("@/services/api", () => ({
  getNodeDetailsWithPackageInfo: (nodeId: string, mode: string) =>
    pageState.getNodeDetailsWithPackageInfo(nodeId, mode),
  getMCPHealthModeAware: (nodeId: string, mode: string) =>
    pageState.getMCPHealthModeAware(nodeId, mode),
  getMCPServerMetrics: (nodeId: string) => pageState.getMCPServerMetrics(nodeId),
  getNodeStatus: (nodeId: string) => pageState.getNodeStatus(nodeId),
}));

vi.mock("@/services/configurationApi", () => ({
  startAgent: (nodeId: string) => pageState.startAgent(nodeId),
  stopAgent: (nodeId: string) => pageState.stopAgent(nodeId),
  reconcileAgent: (nodeId: string) => pageState.reconcileAgent(nodeId),
}));

vi.mock("@/components/ui/notification", () => ({
  NotificationProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  useSuccessNotification: () => pageState.showSuccess,
  useErrorNotification: () => pageState.showError,
  useInfoNotification: () => pageState.showInfo,
}));

vi.mock("@/utils/node-status", () => ({
  getNodeStatusPresentation: () => ({
    label: "Ready",
    shouldPulse: false,
    theme: {
      bgClass: "bg-ready",
      textClass: "text-ready",
      borderClass: "border-ready",
      indicatorClass: "dot-ready",
    },
  }),
}));

vi.mock("@/components/nodes", () => ({
  EnhancedNodeDetailHeader: ({
    nodeId,
    rightActions,
    liveStatusBadge,
    statusBadges,
  }: {
    nodeId: string;
    rightActions?: React.ReactNode;
    liveStatusBadge?: React.ReactNode;
    statusBadges?: React.ReactNode;
  }) => (
    <section>
      <h1>{nodeId}</h1>
      <div>{rightActions}</div>
      <div>{liveStatusBadge}</div>
      <div>{statusBadges}</div>
    </section>
  ),
  NodeProcessLogsPanel: ({ nodeId }: { nodeId: string }) => <div>Logs for {nodeId}</div>,
}));

vi.mock("@/components/did/DIDInfoModal", () => ({
  DIDInfoModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>DID Modal</div> : null),
}));

vi.mock("@/components/forms/EnvironmentVariableForm", () => ({
  EnvironmentVariableForm: ({ onConfigurationChange }: { onConfigurationChange?: () => void }) => (
    <button type="button" onClick={() => onConfigurationChange?.()}>
      Trigger configuration change
    </button>
  ),
}));

vi.mock("@/components/mcp", () => ({
  MCPServerControls: () => <div>MCP Server Controls</div>,
  MCPServerList: () => <div>MCP Server List</div>,
  MCPToolExplorer: ({ serverAlias }: { serverAlias: string }) => <div>Tool Explorer {serverAlias}</div>,
  MCPToolTester: ({ serverAlias }: { serverAlias: string }) => <div>Tool Tester {serverAlias}</div>,
}));

vi.mock("@/components/ReasonersSkillsTable", () => ({
  ReasonersSkillsTable: ({ reasoners, skills }: { reasoners: Array<{ id: string }>; skills: Array<{ id: string }> }) => (
    <div>
      Reasoners {reasoners.length} Skills {skills.length}
    </div>
  ),
}));

vi.mock("@/components/status", () => ({
  StatusRefreshButton: ({ onRefresh }: { onRefresh?: (status: AgentStatus) => void }) => (
    <button
      type="button"
      onClick={() =>
        onRefresh?.({
          status: "ok",
          lifecycle_status: "ready",
          health_status: "ready",
          last_seen: "2026-04-08T00:00:00Z",
        })
      }
    >
      Refresh status
    </button>
  ),
}));

vi.mock("@/components/ui/AgentControlButton", () => ({
  AgentControlButton: ({ onToggle }: { onToggle?: (action: "start" | "stop" | "reconcile") => void }) => (
    <div>
      <button type="button" onClick={() => onToggle?.("start")}>
        Start agent
      </button>
      <button type="button" onClick={() => onToggle?.("stop")}>
        Stop agent
      </button>
      <button type="button" onClick={() => onToggle?.("reconcile")}>
        Reconcile agent
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
  AlertDescription: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => (
    <p {...props}>{children}</p>
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement>>) => <span {...props}>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <section {...props}>{children}</section>,
  CardContent: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => <p {...props}>{children}</p>,
  CardHeader: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => <h2 {...props}>{children}</h2>,
}));

vi.mock("@/components/ui/RestartRequiredBanner", () => ({
  RestartRequiredBanner: ({ onRestart, onDismiss }: { onRestart?: () => void; onDismiss?: () => void }) => (
    <div>
      <button type="button" onClick={() => onRestart?.()}>Restart required</button>
      <button type="button" onClick={() => onDismiss?.()}>Dismiss restart banner</button>
    </div>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>loading</div>,
}));

vi.mock("@/components/ui/animated-tabs", async () => {
  const ReactModule = await import("react");
  const TabsContext = ReactModule.createContext<{
    value: string;
    onValueChange?: (value: string) => void;
  }>({ value: "" });

  return {
    AnimatedTabs: ({
      children,
      value,
      onValueChange,
      ...props
    }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement> & { value: string; onValueChange?: (value: string) => void }>) => (
      <TabsContext.Provider value={{ value, onValueChange }}>
        <div {...props}>{children}</div>
      </TabsContext.Provider>
    ),
    AnimatedTabsList: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
    AnimatedTabsTrigger: ({ children, value, onClick, ...props }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }>) => {
      const ctx = ReactModule.useContext(TabsContext);
      return (
        <button
          type="button"
          onClick={(event) => {
            onClick?.(event);
            ctx.onValueChange?.(value);
          }}
          {...props}
        >
          {children}
        </button>
      );
    },
    AnimatedTabsContent: ({ children, value, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement> & { value: string }>) => {
      const ctx = ReactModule.useContext(TabsContext);
      return ctx.value === value ? <div {...props}>{children}</div> : null;
    },
  };
});

vi.mock("@/components/layout/ResponsiveGrid", () => ({
  ResponsiveGrid: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => <div {...props}>{children}</div>,
}));

vi.mock("@/components/ui/icon-bridge", () => ({
  AlertCircle: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  Flash: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
}));

describe("NodeDetailPage", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useRealTimers();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((message) => {
      const text = String(message);
      if (text.includes("Failed to fetch node data:")) {
        return;
      }
    });
    pageState.hash = "";
    pageState.mode = "developer";
    pageState.navigate.mockReset();
    pageState.showSuccess.mockReset();
    pageState.showError.mockReset();
    pageState.showInfo.mockReset();
    pageState.getNodeDetailsWithPackageInfo.mockReset();
    pageState.getMCPHealthModeAware.mockReset();
    pageState.getMCPServerMetrics.mockReset();
    pageState.getNodeStatus.mockReset();
    pageState.startAgent.mockReset();
    pageState.stopAgent.mockReset();
    pageState.reconcileAgent.mockReset();

    pageState.getNodeDetailsWithPackageInfo.mockResolvedValue(buildNode());
    pageState.getMCPHealthModeAware.mockResolvedValue({
      status: "ok",
      mcp_servers: [{ alias: "server-a", status: "running", tool_count: 2 }],
      mcp_summary: {
        service_status: "ready",
        running_servers: 1,
        total_servers: 1,
        total_tools: 2,
        overall_health: 100,
        has_issues: false,
        capabilities_available: true,
      },
    });
    pageState.getMCPServerMetrics.mockResolvedValue({});
    pageState.getNodeStatus.mockResolvedValue({
      status: "ok",
      lifecycle_status: "ready",
      health_status: "ready",
      last_seen: "2026-04-08T00:00:00Z",
      mcp_status: { running_servers: 1, total_servers: 1, service_status: "ready" },
    });
    pageState.startAgent.mockResolvedValue({ ok: true });
    pageState.stopAgent.mockResolvedValue({ ok: true });
    pageState.reconcileAgent.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders loading then error state and supports retry", async () => {
    let failFirst = true;
    pageState.getNodeDetailsWithPackageInfo.mockImplementation(async () => {
      if (failFirst) {
        failFirst = false;
        throw new Error("boom");
      }
      return buildNode();
    });

    render(<NodeDetailPage />);

    expect(screen.getByText("Loading node details")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");

    fireEvent.click(screen.getByRole("button", { name: /Retry loading node details/i }));

    expect(await screen.findByRole("heading", { name: "agent-alpha" })).toBeInTheDocument();
    expect(pageState.getNodeDetailsWithPackageInfo).toHaveBeenCalledTimes(2);
  });

  it("renders overview and tab content, handles agent actions, and refreshes tab hashes", async () => {
    render(<NodeDetailPage />);

    expect(await screen.findByRole("heading", { name: "agent-alpha" })).toBeInTheDocument();
    expect(screen.getByText("Reasoners 1 Skills 1")).toBeInTheDocument();
    expect(screen.getByText("https://alpha.example.com")).toBeInTheDocument();
    expect(screen.getByText(/Verified/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start agent" }));
    await waitFor(() => expect(pageState.startAgent).toHaveBeenCalledWith("agent-alpha"));
    expect(pageState.showInfo).toHaveBeenCalledWith("Initiating start sequence for agent-alpha...");

    fireEvent.click(screen.getByRole("button", { name: "Stop agent" }));
    await waitFor(() => expect(pageState.stopAgent).toHaveBeenCalledWith("agent-alpha"));

    fireEvent.click(screen.getByRole("button", { name: "Reconcile agent" }));
    await waitFor(() => expect(pageState.reconcileAgent).toHaveBeenCalledWith("agent-alpha"));

    fireEvent.click(screen.getAllByRole("button", { name: /Refresh status/i })[0]);
    await waitFor(() => expect(pageState.getNodeDetailsWithPackageInfo.mock.calls.length).toBeGreaterThanOrEqual(5));

    fireEvent.click(screen.getByRole("button", { name: /MCP Servers/i }));
    expect(screen.getByText("MCP Server List")).toBeInTheDocument();
    expect(pageState.navigate).toHaveBeenCalledWith("/nodes/agent-alpha#mcp-servers", { replace: true });

    fireEvent.click(screen.getByRole("button", { name: /Tools/i }));
    expect(screen.getByText("Tool Explorer server-a")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Logs/i }));
    expect(screen.getByText("Logs for agent-alpha")).toBeInTheDocument();
  });

  it("shows the configuration tab flow and restart banner behavior", async () => {
    pageState.hash = "#configuration";

    render(<NodeDetailPage />);

    expect(await screen.findByText("Trigger configuration change")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Trigger configuration change" }));
    expect(await screen.findByRole("button", { name: "Restart required" })).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Restart required" }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(pageState.stopAgent).toHaveBeenCalledWith("agent-alpha");

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pageState.startAgent).toHaveBeenCalledWith("agent-alpha");
    expect(screen.queryByRole("button", { name: "Restart required" })).not.toBeInTheDocument();
  });
});

function buildNode(): AgentNodeDetailsForUIWithPackage {
  return {
    id: "agent-alpha",
    base_url: "https://alpha.example.com",
    version: "1.2.3",
    team_id: "team-one",
    health_status: "ready",
    lifecycle_status: "ready",
    last_heartbeat: "2026-04-08T00:00:00Z",
    registered_at: "2026-04-07T00:00:00Z",
    deployment_type: "serverless",
    invocation_url: "https://invoke.example.com",
    mcp_summary: {
      service_status: "ready",
      running_servers: 1,
      total_servers: 1,
      total_tools: 2,
      overall_health: 100,
      has_issues: false,
      capabilities_available: true,
    },
    mcp_servers: [{ alias: "server-a", status: "running", tool_count: 2 }],
    reasoners: [{ id: "reasoner.one", name: "Reasoner One" }],
    skills: [{ id: "skill.one", name: "Skill One" }],
    package_info: { package_id: "pkg-agent-alpha" },
  };
}
