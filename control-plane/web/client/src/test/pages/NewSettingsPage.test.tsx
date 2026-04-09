import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewSettingsPage } from "@/pages/NewSettingsPage";

const pageState = vi.hoisted(() => ({
  clipboardWriteText: vi.fn<(value: string) => Promise<void>>(),
  getObservabilityWebhook: vi.fn(),
  setObservabilityWebhook: vi.fn(),
  deleteObservabilityWebhook: vi.fn(),
  getObservabilityWebhookStatus: vi.fn(),
  redriveDeadLetterQueue: vi.fn(),
  clearDeadLetterQueue: vi.fn(),
  getDIDSystemStatus: vi.fn(),
  getNodeLogProxySettings: vi.fn(),
  putNodeLogProxySettings: vi.fn(),
  open: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TabsList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  TabsTrigger: ({
    children,
    ...props
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
    <section {...props}>{children}</section>
  ),
  CardHeader: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
    <div {...props}>{children}</div>
  ),
  CardTitle: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h2 {...props}>{children}</h2>
  ),
  CardDescription: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => (
    <p {...props}>{children}</p>
  ),
  CardContent: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
    <div {...props}>{children}</div>
  ),
  CardFooter: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
    <div {...props}>{children}</div>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => <input ref={ref} {...props} />,
  ),
}));

vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: React.PropsWithChildren<React.LabelHTMLAttributes<HTMLLabelElement>>) => (
    <label {...props}>{children}</label>
  ),
}));

vi.mock("@/components/ui/switch", () => ({
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...props}
    />
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
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    showIcon: _showIcon,
    ...props
  }: React.PropsWithChildren<React.HTMLAttributes<HTMLSpanElement> & { showIcon?: boolean }>) => (
    <span {...props}>{children}</span>
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: (props: React.HTMLAttributes<HTMLHRElement>) => <hr {...props} />,
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>) => (
    <div {...props}>{children}</div>
  ),
  AlertTitle: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) => (
    <h3 {...props}>{children}</h3>
  ),
  AlertDescription: ({ children, ...props }: React.PropsWithChildren<React.HTMLAttributes<HTMLParagraphElement>>) => (
    <p {...props}>{children}</p>
  ),
}));

vi.mock("@/components/ui/icon-bridge", () => {
  const Icon = ({ className }: { className?: string }) => <span className={className}>icon</span>;
  return {
    Trash: Icon,
    Plus: Icon,
    CheckCircle: Icon,
    XCircle: Icon,
    Renew: Icon,
    Eye: Icon,
    EyeOff: Icon,
    Copy: Icon,
  };
});

vi.mock("@/services/observabilityWebhookApi", () => ({
  getObservabilityWebhook: (...args: unknown[]) => pageState.getObservabilityWebhook(...args),
  setObservabilityWebhook: (...args: unknown[]) => pageState.setObservabilityWebhook(...args),
  deleteObservabilityWebhook: (...args: unknown[]) => pageState.deleteObservabilityWebhook(...args),
  getObservabilityWebhookStatus: (...args: unknown[]) => pageState.getObservabilityWebhookStatus(...args),
  redriveDeadLetterQueue: (...args: unknown[]) => pageState.redriveDeadLetterQueue(...args),
  clearDeadLetterQueue: (...args: unknown[]) => pageState.clearDeadLetterQueue(...args),
}));

vi.mock("@/services/didApi", () => ({
  getDIDSystemStatus: (...args: unknown[]) => pageState.getDIDSystemStatus(...args),
}));

vi.mock("@/services/api", () => ({
  getNodeLogProxySettings: (...args: unknown[]) => pageState.getNodeLogProxySettings(...args),
  putNodeLogProxySettings: (...args: unknown[]) => pageState.putNodeLogProxySettings(...args),
}));

function seedPageMocks() {
  pageState.getObservabilityWebhook.mockResolvedValue({
    configured: true,
    config: {
      url: "https://hooks.example.test/events",
      enabled: true,
      secret_configured: true,
      headers: { Authorization: "Bearer token" },
      created_at: "2026-04-07T10:00:00Z",
      updated_at: "2026-04-07T12:00:00Z",
    },
  });
  pageState.setObservabilityWebhook.mockResolvedValue({ success: true, configured: true });
  pageState.deleteObservabilityWebhook.mockResolvedValue({ success: true });
  pageState.getObservabilityWebhookStatus.mockResolvedValue({
    enabled: true,
    events_forwarded: 1234,
    events_dropped: 5,
    queue_depth: 2,
    dead_letter_count: 3,
    last_forwarded_at: "2026-04-07T12:05:00Z",
    last_error: "temporary upstream timeout",
  });
  pageState.redriveDeadLetterQueue.mockResolvedValue({
    success: true,
    processed: 3,
    message: "redrove 3 events",
  });
  pageState.clearDeadLetterQueue.mockResolvedValue({
    success: true,
    message: "cleared",
  });
  pageState.getDIDSystemStatus.mockResolvedValue({
    status: "active",
    message: "online",
    timestamp: "2026-04-07T12:00:00Z",
  });
  pageState.getNodeLogProxySettings.mockResolvedValue({
    env_locks: {
      connect_timeout: false,
      stream_idle_timeout: false,
      max_stream_duration: false,
      max_tail_lines: false,
    },
    effective: {
      connect_timeout: "20s",
      stream_idle_timeout: "2m",
      max_stream_duration: "10m",
      max_tail_lines: 250,
    },
  });
  pageState.putNodeLogProxySettings.mockResolvedValue({
    effective: {
      connect_timeout: "30s",
      stream_idle_timeout: "3m",
      max_stream_duration: "15m",
      max_tail_lines: 500,
    },
  });
}

describe("NewSettingsPage", () => {
  beforeEach(() => {
    seedPageMocks();
    pageState.clipboardWriteText.mockResolvedValue();
    pageState.open.mockReturnValue(null);
    pageState.confirm.mockReturnValue(true);

    Object.defineProperty(window, "confirm", {
      configurable: true,
      value: pageState.confirm,
    });
    Object.defineProperty(window, "open", {
      configurable: true,
      value: pageState.open,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: pageState.clipboardWriteText },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ agentfield_server_did: "did:web:agentfield.example.test" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all settings tabs with loaded observability, identity, and agent log state", async () => {
    render(<NewSettingsPage />);

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("https://hooks.example.test/events")).toBeInTheDocument();

    expect(pageState.getObservabilityWebhook).toHaveBeenCalledTimes(1);
    expect(pageState.getObservabilityWebhookStatus).toHaveBeenCalledTimes(1);
    expect(pageState.getDIDSystemStatus).toHaveBeenCalledTimes(1);
    expect(pageState.getNodeLogProxySettings).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText("Online")).toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("did:web:agentfield.example.test")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20s")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2m")).toBeInTheDocument();
    expect(screen.getByDisplayValue("10m")).toBeInTheDocument();
    expect(screen.getByDisplayValue("250")).toBeInTheDocument();
    expect(screen.getByText("Event Types")).toBeInTheDocument();
    expect(screen.getByText("Execution Events")).toBeInTheDocument();
    expect(screen.getByText("About AgentField")).toBeInTheDocument();
    expect(screen.getByText("0.1.63")).toBeInTheDocument();
    expect(screen.getByText("Local (SQLite)")).toBeInTheDocument();
  });

  it("handles copy, export, webhook management, and node log proxy updates", async () => {
    render(<NewSettingsPage />);

    const webhookUrl = await screen.findByLabelText("Webhook URL");
    fireEvent.change(webhookUrl, { target: { value: "https://hooks.example.test/next" } });

    fireEvent.click(screen.getAllByRole("button", { name: /Copy/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Copy server DID/i }));
    fireEvent.click(screen.getByRole("button", { name: /Export All Credentials/i }));

    fireEvent.click(screen.getByRole("button", { name: /Update Configuration/i }));
    await waitFor(() => {
      expect(pageState.setObservabilityWebhook).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://hooks.example.test/next",
          enabled: true,
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove Webhook/i }));
    await waitFor(() => {
      expect(pageState.deleteObservabilityWebhook).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(await screen.findByRole("button", { name: /Redrive/i }));
    await waitFor(() => {
      expect(pageState.redriveDeadLetterQueue).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(await screen.findByRole("button", { name: /Clear/i }));
    await waitFor(() => {
      expect(pageState.clearDeadLetterQueue).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("Connect timeout"), { target: { value: "30s" } });
    fireEvent.change(screen.getByLabelText("Stream idle timeout"), { target: { value: "3m" } });
    fireEvent.change(screen.getByLabelText("Max stream duration"), { target: { value: "15m" } });
    fireEvent.change(screen.getByLabelText("Max tail lines (per request)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));

    await waitFor(() => {
      expect(pageState.putNodeLogProxySettings).toHaveBeenCalledWith({
        connect_timeout: "30s",
        stream_idle_timeout: "3m",
        max_stream_duration: "15m",
        max_tail_lines: 500,
      });
    });

    expect(pageState.clipboardWriteText).toHaveBeenCalledWith("http://localhost:3000");
    expect(pageState.clipboardWriteText).toHaveBeenCalledWith("did:web:agentfield.example.test");
    expect(pageState.open).toHaveBeenCalledWith("/api/ui/v1/did/export/vcs", "_blank");
    expect(pageState.confirm).toHaveBeenCalled();
  });
});
