import { useState } from "react";
import { useStepDetail } from "@/hooks/queries";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ChevronDown } from "@/components/ui/icon-bridge";
import { Copy, Check, ShieldAlert, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { retryExecutionWebhook } from "@/services/executionsApi";
import { formatDuration } from "./RunTrace";
import { JsonHighlightedPre } from "@/components/ui/json-syntax-highlight";

// ─── Copy button with transient check icon ────────────────────────────────────

function CopyBtn({
  label,
  getText,
  disabled,
}: {
  label: string;
  getText: () => string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    const text = getText();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-[10px] text-muted-foreground"
      onClick={handleClick}
      disabled={disabled}
    >
      {copied ? (
        <Check className="size-2.5 mr-1" />
      ) : (
        <Copy className="size-2.5 mr-1" />
      )}
      {label}
    </Button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StepDetail({ executionId }: { executionId: string }) {
  const { data: execution, isLoading } = useStepDetail(executionId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-60" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-8">
        Step not found
      </div>
    );
  }

  const hasError = Boolean(execution.error_message);
  const hasOutput = execution.output_data != null;
  const hasInput = execution.input_data != null;
  const notes = execution.notes ?? [];

  const buildCurl = () => {
    const origin = window.location.origin;
    return (
      `curl -X POST '${origin}/api/v1/execute/${execution.agent_node_id}.${execution.reasoner_id}' \\\n` +
      `  -H 'Content-Type: application/json' \\\n` +
      `  -H 'X-API-Key: YOUR_API_KEY' \\\n` +
      `  -d '${JSON.stringify({ input: execution.input_data })}'`
    );
  };

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        {/* Step header */}
        <div>
          <h3 className="text-sm font-semibold font-mono">
            {execution.reasoner_id}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agent: {execution.agent_node_id}
            {" · "}
            Duration: {formatDuration(execution.duration_ms)}
            {execution.workflow_depth != null && (
              <> · Depth: {execution.workflow_depth}</>
            )}
          </p>

          {/* Copy action row */}
          <div className="flex flex-wrap items-center gap-0.5 mt-2">
            <CopyBtn label="Copy cURL" getText={buildCurl} />
            <CopyBtn
              label="Copy Input"
              getText={() => JSON.stringify(execution.input_data, null, 2)}
              disabled={!hasInput}
            />
            <CopyBtn
              label="Copy Output"
              getText={() => JSON.stringify(execution.output_data, null, 2)}
              disabled={!hasOutput}
            />
          </div>
        </div>

        {/* Input section */}
        {hasInput && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left">
              <ChevronDown className="size-3 transition-transform [[data-state=open]_&]:rotate-0 [[data-state=closed]_&]:-rotate-90" />
              Input
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-md bg-muted p-3 overflow-auto max-h-64">
                <JsonHighlightedPre
                  data={execution.input_data}
                  className="text-xs font-mono leading-relaxed"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Output or Error */}
        {hasError ? (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
            <p className="text-xs font-medium text-destructive">Error</p>
            <p className="text-xs mt-1 font-mono whitespace-pre-wrap break-all">
              {execution.error_message}
            </p>
          </div>
        ) : hasOutput ? (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left">
              <ChevronDown className="size-3 transition-transform [[data-state=open]_&]:rotate-0 [[data-state=closed]_&]:-rotate-90" />
              Output
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 rounded-md bg-muted p-3 overflow-auto max-h-64">
                <JsonHighlightedPre
                  data={execution.output_data}
                  className="text-xs font-mono leading-relaxed"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            No output
          </div>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left">
              <ChevronDown className="size-3 transition-transform [[data-state=open]_&]:rotate-0 [[data-state=closed]_&]:-rotate-90" />
              Notes ({notes.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 flex flex-col gap-2">
                {notes.map((note, i) => (
                  <div
                    key={i}
                    className="rounded-md bg-muted p-2 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {new Date(note.timestamp).toLocaleTimeString()}
                    </span>{" "}
                    {note.message}
                    {note.tags?.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="ml-1 text-[10px] py-0 h-4"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Webhook Delivery */}
        {(execution.webhook_registered || (execution.webhook_events && execution.webhook_events.length > 0)) && (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left">
              <ChevronDown className="size-3 transition-transform [[data-state=open]_&]:rotate-0 [[data-state=closed]_&]:-rotate-90" />
              Webhooks ({execution.webhook_events?.length ?? 0})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 flex flex-col gap-1">
                {execution.webhook_events && execution.webhook_events.length > 0 ? (
                  execution.webhook_events.map((event, i) => (
                    <div
                      key={event.id ?? i}
                      className="flex items-center justify-between rounded-md bg-muted px-2 py-1.5 text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "size-1.5 rounded-full shrink-0",
                            event.status === "delivered"
                              ? "bg-green-500"
                              : event.status === "failed"
                                ? "bg-red-500"
                                : "bg-amber-500 animate-pulse",
                          )}
                        />
                        <span className="font-mono truncate max-w-[120px]">
                          {event.event_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground shrink-0">
                        {event.http_status != null && (
                          <span
                            className={cn(
                              event.http_status >= 200 && event.http_status < 300
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-500",
                            )}
                          >
                            HTTP {event.http_status}
                          </span>
                        )}
                        {!event.http_status && (
                          <span className="capitalize">{event.status}</span>
                        )}
                        <span>{new Date(event.created_at).toLocaleTimeString()}</span>
                        {event.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px] gap-1"
                            onClick={() =>
                              retryExecutionWebhook(execution.execution_id).catch(
                                console.error,
                              )
                            }
                          >
                            <RefreshCw className="size-2.5" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground px-1">
                    Webhook registered but no delivery attempts yet.
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* HITL Approval Section */}
        {(execution.status === "waiting" || execution.approval_request_id) && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="py-2 px-3">
              <CardTitle className="text-xs font-medium flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-amber-500" />
                Human Approval Required
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 flex flex-col gap-2">
              {execution.approval_status && (
                <p className="text-[11px] text-muted-foreground">
                  Status:{" "}
                  <Badge variant="outline" className="text-[10px] ml-1">
                    {execution.approval_status}
                  </Badge>
                </p>
              )}
              {execution.approval_requested_at && (
                <p className="text-[11px] text-muted-foreground">
                  Requested:{" "}
                  {new Date(execution.approval_requested_at).toLocaleString()}
                </p>
              )}
              {execution.approval_request_id &&
                execution.approval_status === "pending" && (
                  <div className="flex gap-2 mt-1">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await fetch("/api/v1/webhooks/approval-response", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "X-API-Key":
                              localStorage.getItem("agentfield_api_key") ?? "",
                          },
                          body: JSON.stringify({
                            requestId: execution.approval_request_id,
                            decision: "approved",
                          }),
                        });
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={async () => {
                        await fetch("/api/v1/webhooks/approval-response", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "X-API-Key":
                              localStorage.getItem("agentfield_api_key") ?? "",
                          },
                          body: JSON.stringify({
                            requestId: execution.approval_request_id,
                            decision: "rejected",
                          }),
                        });
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
