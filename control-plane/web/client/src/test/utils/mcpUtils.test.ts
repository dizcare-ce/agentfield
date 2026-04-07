import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MCPHealthEvent,
  MCPServerHealthForUI,
  MCPServerMetrics,
} from "@/types/agentfield";
import {
  aggregateMCPSummary,
  calculateOverallHealth,
  calculatePerformanceMetrics,
  filterHealthEventsByType,
  formatCpuUsage,
  formatErrorMessage,
  formatErrorRate,
  formatMemoryUsage,
  formatResponseTime,
  formatSuccessRate,
  formatTimestamp,
  formatUptime,
  getHealthStatusColor,
  getHealthStatusText,
  getMCPStatusColor,
  getMCPStatusIcon,
  getRecentHealthEvents,
  serverNeedsAttention,
  sortServersByPriority,
  validateToolParameters,
} from "@/utils/mcpUtils";

function makeServer(
  alias: string,
  status: MCPServerHealthForUI["status"],
  overrides: Partial<MCPServerHealthForUI> = {}
): MCPServerHealthForUI {
  return {
    alias,
    status,
    tool_count: 1,
    ...overrides,
  };
}

describe("mcpUtils", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps MCP status colors and icons with fallbacks", () => {
    expect(getMCPStatusColor("running")).toBe("#10b981");
    expect(getMCPStatusColor("mystery")).toBe("#9ca3af");
    expect(getMCPStatusIcon("starting")).toBe("◐");
    expect(getMCPStatusIcon("mystery")).toBe("?");
  });

  it("calculates overall health and aggregate summaries", () => {
    const servers = [
      makeServer("alpha", "running", { tool_count: 3 }),
      makeServer("beta", "starting", { tool_count: 2 }),
      makeServer("gamma", "error", { error_message: "down" }),
    ];

    expect(calculateOverallHealth(servers)).toBe(57);
    expect(calculateOverallHealth([])).toBe(0);
    expect(aggregateMCPSummary(servers)).toEqual({
      total_servers: 3,
      running_servers: 1,
      total_tools: 6,
      overall_health: 57,
      has_issues: true,
      capabilities_available: true,
      service_status: "degraded",
    });
    expect(aggregateMCPSummary([makeServer("idle", "stopped")]).service_status).toBe(
      "unavailable"
    );
  });

  it("formats uptime, response times, rates, and resource usage", () => {
    expect(formatUptime(undefined)).toBe("Unknown");
    expect(formatUptime("2026-04-08T12:00:00Z")).toBe("Unknown");
    expect(formatUptime("2026-04-07T11:59:15Z")).toBe("45s");
    expect(formatUptime("2026-04-07T11:50:00Z")).toBe("10m 0s");
    expect(formatUptime("2026-04-07T09:30:00Z")).toBe("2h 30m");
    expect(formatUptime("2026-04-05T10:00:00Z")).toBe("2d 2h");

    expect(formatResponseTime(undefined)).toBe("N/A");
    expect(formatResponseTime(321.2)).toBe("321ms");
    expect(formatResponseTime(1530)).toBe("1.5s");
    expect(formatSuccessRate(undefined)).toBe("N/A");
    expect(formatSuccessRate(0.934)).toBe("93%");
    expect(formatErrorRate(undefined)).toBe("N/A");
    expect(formatErrorRate(12.8)).toBe("13%");
    expect(formatMemoryUsage(undefined)).toBe("N/A");
    expect(formatMemoryUsage(512)).toBe("512MB");
    expect(formatMemoryUsage(1536)).toBe("1.5GB");
    expect(formatCpuUsage(undefined)).toBe("N/A");
    expect(formatCpuUsage(12.3)).toBe("12%");
  });

  it("formats timestamps for user and developer modes", () => {
    expect(formatTimestamp(undefined)).toBe("Unknown");
    expect(formatTimestamp("2026-04-07T11:59:50Z")).toBe("Just now");
    expect(formatTimestamp("2026-04-07T11:55:00Z")).toBe("5m ago");
    expect(formatTimestamp("2026-04-07T10:00:00Z")).toBe("2h ago");
    expect(formatTimestamp("2026-04-01T12:00:00Z")).toBe("6d ago");

    const oldDate = "2026-03-20T12:00:00Z";
    expect(formatTimestamp(oldDate)).toBe(new Date(oldDate).toLocaleDateString());
    expect(formatTimestamp(oldDate, "developer")).toBe(
      new Date(oldDate).toLocaleString()
    );
  });

  it("formats health labels, colors, and error messages", () => {
    expect(getHealthStatusText(95)).toBe("Excellent");
    expect(getHealthStatusText(80)).toBe("Good");
    expect(getHealthStatusText(60)).toBe("Fair");
    expect(getHealthStatusText(30)).toBe("Poor");
    expect(getHealthStatusText(10)).toBe("Critical");

    expect(getHealthStatusColor(95)).toBe("#10b981");
    expect(getHealthStatusColor(80)).toBe("#84cc16");
    expect(getHealthStatusColor(60)).toBe("#f59e0b");
    expect(getHealthStatusColor(30)).toBe("#f97316");
    expect(getHealthStatusColor(10)).toBe("#ef4444");

    expect(formatErrorMessage(undefined)).toBe("");
    expect(formatErrorMessage("connection refused by upstream")).toBe("Connection failed");
    expect(formatErrorMessage("request timeout waiting for response")).toBe(
      "Request timed out"
    );
    expect(formatErrorMessage("service not found in registry")).toBe("Service not found");
    expect(formatErrorMessage("permission denied for action")).toBe("Access denied");
    expect(formatErrorMessage("invalid payload provided")).toBe("Invalid request");
    expect(
      formatErrorMessage(
        "This is a very long sentence without a period that should be truncated after one hundred characters because the user view wants brevity"
      )
    ).toHaveLength(103);
    expect(formatErrorMessage("raw internal detail", "developer")).toBe("raw internal detail");
  });

  it("calculates metrics, attention state, priority ordering, and event helpers", () => {
    const metrics: MCPServerMetrics = {
      alias: "alpha",
      total_requests: 20,
      successful_requests: 18,
      failed_requests: 2,
      avg_response_time_ms: 450,
      peak_response_time_ms: 900,
      requests_per_minute: 6,
      uptime_seconds: 1800,
      error_rate_percent: 10,
    };

    expect(calculatePerformanceMetrics(metrics)).toEqual({
      successRate: 0.9,
      errorRate: 10,
      avgResponseTime: 450,
      peakResponseTime: 900,
      requestsPerMinute: 6,
      uptime: 1800,
    });

    expect(serverNeedsAttention(makeServer("error", "error"))).toBe(true);
    expect(serverNeedsAttention(makeServer("slow", "running", { avg_response_time_ms: 6001 }))).toBe(
      true
    );
    expect(serverNeedsAttention(makeServer("healthy", "running", { success_rate: 0.99 }))).toBe(
      false
    );

    const sorted = sortServersByPriority([
      makeServer("zeta", "running"),
      makeServer("alpha", "unknown"),
      makeServer("bravo", "error"),
      makeServer("charlie", "running", { success_rate: 0.4 }),
    ]);
    expect(sorted.map((server) => server.alias)).toEqual([
      "bravo",
      "charlie",
      "zeta",
      "alpha",
    ]);

    const events: MCPHealthEvent[] = [
      {
        timestamp: "2026-04-07T10:00:00Z",
        type: "warning",
        message: "warn",
      },
      {
        timestamp: "2026-04-07T11:00:00Z",
        type: "info",
        message: "info",
      },
      {
        timestamp: "2026-04-07T09:00:00Z",
        type: "warning",
        message: "older",
      },
    ];
    expect(filterHealthEventsByType(events, "warning")).toHaveLength(2);
    expect(getRecentHealthEvents([...events], 2).map((event) => event.message)).toEqual([
      "info",
      "warn",
    ]);
  });

  it("validates tool parameters against required fields and primitive types", () => {
    expect(validateToolParameters({ anything: "goes" }, null)).toEqual({
      valid: true,
      errors: [],
    });

    expect(
      validateToolParameters(
        { count: "not-a-number", enabled: "maybe" },
        {
          required: ["name", "enabled"],
          properties: {
            name: { type: "string" },
            count: { type: "number" },
            enabled: { type: "boolean" },
          },
        }
      )
    ).toEqual({
      valid: false,
      errors: [
        "Required field 'name' is missing",
        "Field 'count' must be a number",
        "Field 'enabled' must be a boolean",
      ],
    });

    expect(
      validateToolParameters(
        { name: "ok", count: "3", enabled: "true" },
        {
          required: ["name"],
          properties: {
            name: { type: "string" },
            count: { type: "number" },
            enabled: { type: "boolean" },
          },
        }
      )
    ).toEqual({ valid: true, errors: [] });
  });
});
