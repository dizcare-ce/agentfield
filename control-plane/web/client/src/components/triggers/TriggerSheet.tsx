import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock,
  Lock,
  PauseFilled,
  RadioTower,
  Settings,
  Trash,
} from "@/components/ui/icon-bridge";
import { EventRow, type EventRowEvent } from "@/components/triggers/EventRow";

interface Trigger {
  id: string;
  source_name: string;
  config: Record<string, unknown> | string | null;
  secret_env_var: string;
  target_node_id: string;
  target_reasoner: string;
  event_types?: string[] | null;
  managed_by: "code" | "ui";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface TriggerSheetProps {
  open: boolean;
  trigger: Trigger | null;
  serverUrl: string;
  publicUrl: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onEnabledChange: (enabled: boolean) => void;
  onDelete: () => void;
}

interface InboundEvent extends EventRowEvent {
  trigger_id: string;
  source_name: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatConfig(config: Trigger["config"]): string {
  if (typeof config === "string") {
    return config;
  }
  return JSON.stringify(config ?? {}, null, 2);
}

export function TriggerSheet({
  open,
  trigger,
  serverUrl,
  publicUrl,
  busy = false,
  onOpenChange,
  onEnabledChange,
  onDelete,
}: TriggerSheetProps) {
  const [events, setEvents] = useState<InboundEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  const triggerId = trigger?.id;
  const isCodeManaged = trigger?.managed_by === "code";

  const eventTypes = useMemo(() => {
    if (!trigger?.event_types?.length) {
      return "All event types";
    }
    return trigger.event_types.join(", ");
  }, [trigger]);

  const refreshEvents = useCallback(async () => {
    if (!triggerId) {
      return;
    }
    try {
      setLoadingEvents(true);
      const res = await fetchJson<{ events: InboundEvent[] }>(
        `${serverUrl}/api/v1/triggers/${triggerId}/events`,
      );
      setEvents(res.events || []);
      setEventError(null);
    } catch (e) {
      setEventError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingEvents(false);
    }
  }, [serverUrl, triggerId]);

  useEffect(() => {
    if (open && triggerId) {
      void refreshEvents();
    }
  }, [open, refreshEvents, triggerId]);

  async function replay(eventId: string) {
    if (!triggerId) {
      return;
    }
    try {
      await fetchJson(
        `${serverUrl}/api/v1/triggers/${triggerId}/events/${eventId}/replay`,
        { method: "POST" },
      );
      await refreshEvents();
    } catch (e) {
      setEventError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        {trigger ? (
          <>
            <div className="border-b border-border bg-background p-6">
              <SheetHeader className="space-y-4">
                <div className="flex items-start justify-between gap-6 pr-8">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="rounded-md border border-border bg-muted p-2">
                      <RadioTower className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <SheetTitle className="truncate">
                        {trigger.source_name}
                      </SheetTitle>
                      <SheetDescription className="truncate text-muted-foreground">
                        {trigger.id}
                      </SheetDescription>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={trigger.enabled}
                      disabled={busy}
                      onCheckedChange={onEnabledChange}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={isCodeManaged || busy}
                      onClick={onDelete}
                      title={
                        isCodeManaged
                          ? "Code-managed triggers are removed from agent code"
                          : "Delete trigger"
                      }
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={trigger.enabled ? "secondary" : "outline"}>
                    {trigger.enabled ? "Enabled" : "Paused"}
                  </Badge>
                  <Badge variant={isCodeManaged ? "secondary" : "outline"}>
                    {trigger.managed_by}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Updated {formatDate(trigger.updated_at)}
                  </span>
                </div>
              </SheetHeader>
            </div>

            {!trigger.enabled ? (
              <div className="sticky top-0 z-10 border-b border-border bg-muted p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <PauseFilled className="h-4 w-4" />
                  This trigger is paused and will not dispatch inbound events.
                </div>
              </div>
            ) : null}

            <Tabs defaultValue="events" className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-border bg-background px-6 py-3">
                <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="events" variant="underline">
                    Events
                  </TabsTrigger>
                  <TabsTrigger value="configuration" variant="underline">
                    Configuration
                  </TabsTrigger>
                  <TabsTrigger value="secrets" variant="underline">
                    Secrets
                  </TabsTrigger>
                  <TabsTrigger value="dispatch" variant="underline">
                    Dispatch logs
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="p-6">
                  <TabsContent value="events" className="mt-0 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <h3 className="text-sm font-medium">Recent events</h3>
                        <p className="text-xs text-muted-foreground">
                          Stored events received for this trigger.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshEvents()}
                        disabled={loadingEvents}
                      >
                        Refresh
                      </Button>
                    </div>
                    {eventError ? (
                      <Alert variant="destructive">
                        <AlertDescription>{eventError}</AlertDescription>
                      </Alert>
                    ) : null}
                    {loadingEvents ? (
                      <div className="text-sm text-muted-foreground">
                        Loading...
                      </div>
                    ) : events.length === 0 ? (
                      <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
                        No events received yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {events.map((event) => (
                          <EventRow
                            key={event.id}
                            event={event}
                            onReplay={(eventId) => void replay(eventId)}
                          />
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="configuration" className="mt-0 space-y-4">
                    <DetailSection
                      icon={<Settings className="h-4 w-4" />}
                      title="Target"
                      rows={[
                        ["Node", trigger.target_node_id],
                        ["Reasoner", trigger.target_reasoner],
                        ["Event types", eventTypes],
                      ]}
                    />
                    <Separator />
                    <DetailSection
                      icon={<RadioTower className="h-4 w-4" />}
                      title="Ingress"
                      rows={[
                        ["Public URL", publicUrl],
                        ["Created", formatDate(trigger.created_at)],
                        ["Updated", formatDate(trigger.updated_at)],
                      ]}
                      copyValue={publicUrl}
                    />
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Config JSON</h3>
                      <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4 text-xs text-foreground">
                        {formatConfig(trigger.config)}
                      </pre>
                    </div>
                  </TabsContent>

                  <TabsContent value="secrets" className="mt-0 space-y-4">
                    <DetailSection
                      icon={<Lock className="h-4 w-4" />}
                      title="Signature secret"
                      rows={[
                        ["Env var", trigger.secret_env_var || "Not configured"],
                        ["Source", trigger.source_name],
                      ]}
                    />
                    <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
                      Secret values stay on the server and are referenced by env
                      var name only.
                    </div>
                  </TabsContent>

                  <TabsContent value="dispatch" className="mt-0 space-y-4">
                    <DetailSection
                      icon={<Clock className="h-4 w-4" />}
                      title="Dispatch logs"
                      rows={[
                        ["Target", `${trigger.target_node_id}.${trigger.target_reasoner}`],
                        ["Last update", formatDate(trigger.updated_at)],
                      ]}
                    />
                    <div className="rounded-md border border-border bg-muted p-4 text-sm text-muted-foreground">
                      Dispatch log rows will appear here when the API exposes
                      them.
                    </div>
                  </TabsContent>
                </div>
              </ScrollArea>
            </Tabs>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({
  icon,
  title,
  rows,
  copyValue,
}: {
  icon: ReactNode;
  title: string;
  rows: Array<[string, string]>;
  copyValue?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {copyValue ? (
          <CopyButton value={copyValue} size="icon-sm" tooltip="Copy value" />
        ) : null}
      </div>
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-all font-mono text-xs text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
