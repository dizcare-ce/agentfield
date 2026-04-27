import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types matching the control-plane responses
// ---------------------------------------------------------------------------

interface SourceCatalogEntry {
  name: string;
  kind: "http" | "loop" | string;
  secret_required: boolean;
  config_schema: Record<string, unknown>;
}

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

interface InboundEvent {
  id: string;
  trigger_id: string;
  source_name: string;
  event_type: string;
  status: string;
  error_message?: string;
  received_at: string;
  processed_at?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const serverUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    "/api/ui/v1",
    "",
  ) || window.location.origin;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function publicIngestUrl(triggerId: string): string {
  return `${serverUrl}/sources/${triggerId}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TriggersPage() {
  const [sources, setSources] = useState<SourceCatalogEntry[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [eventsForTrigger, setEventsForTrigger] = useState<Trigger | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [s, t] = await Promise.all([
        fetchJson<{ sources: SourceCatalogEntry[] }>(
          `${serverUrl}/api/v1/sources`,
        ),
        fetchJson<{ triggers: Trigger[] }>(`${serverUrl}/api/v1/triggers`),
      ]);
      setSources(s.sources || []);
      setTriggers(t.triggers || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Triggers</h1>
          <p className="text-sm text-muted-foreground">
            Inbound event sources — Stripe, GitHub, Slack, scheduled cron, and
            generic webhooks — that fire reasoners when something happens.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New trigger</Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Active triggers</CardTitle>
          <CardDescription>
            Code-managed triggers come from <code>@on_event</code> /{" "}
            <code>@on_schedule</code> declarations in agent code and cannot be
            edited or deleted from the UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : triggers.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No triggers yet. Click <em>New trigger</em> to create one, or
              declare them in agent code with <code>@on_event</code>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Public URL</TableHead>
                  <TableHead>Managed by</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {triggers.map((t) => (
                  <TriggerRow
                    key={t.id}
                    trigger={t}
                    onChanged={refresh}
                    onShowEvents={() => setEventsForTrigger(t)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateTriggerDialog
          sources={sources}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            void refresh();
          }}
        />
      )}

      {eventsForTrigger && (
        <EventsDialog
          trigger={eventsForTrigger}
          onClose={() => setEventsForTrigger(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trigger row
// ---------------------------------------------------------------------------

function TriggerRow({
  trigger,
  onChanged,
  onShowEvents,
}: {
  trigger: Trigger;
  onChanged: () => void;
  onShowEvents: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = publicIngestUrl(trigger.id);
  const isCode = trigger.managed_by === "code";

  async function toggle(enabled: boolean) {
    try {
      setBusy(true);
      await fetchJson(`${serverUrl}/api/v1/triggers/${trigger.id}`, {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete trigger ${trigger.id}?`)) return;
    try {
      setBusy(true);
      await fetchJson(`${serverUrl}/api/v1/triggers/${trigger.id}`, {
        method: "DELETE",
      });
      onChanged();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{trigger.source_name}</span>
          {trigger.event_types && trigger.event_types.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {trigger.event_types.join(", ")}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <code className="text-xs">
          {trigger.target_node_id}.{trigger.target_reasoner}
        </code>
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={copyUrl}
          className="text-xs underline-offset-2 hover:underline"
          title={url}
        >
          {copied ? "Copied!" : `${url.slice(0, 48)}${url.length > 48 ? "…" : ""}`}
        </button>
      </TableCell>
      <TableCell>
        <Badge variant={isCode ? "secondary" : "outline"}>
          {trigger.managed_by}
        </Badge>
      </TableCell>
      <TableCell>
        <Switch
          checked={trigger.enabled}
          disabled={busy}
          onCheckedChange={(v) => toggle(Boolean(v))}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onShowEvents}>
          Events
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={isCode || busy}
          onClick={remove}
          title={
            isCode
              ? "Code-managed triggers must be removed from agent code"
              : undefined
          }
        >
          Delete
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

function CreateTriggerDialog({
  sources,
  onClose,
  onCreated,
}: {
  sources: SourceCatalogEntry[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sourceName, setSourceName] = useState(sources[0]?.name ?? "");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [targetReasoner, setTargetReasoner] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const [secretEnv, setSecretEnv] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => sources.find((s) => s.name === sourceName),
    [sources, sourceName],
  );
  const requiresSecret = selectedSource?.secret_required ?? false;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      let cfg: Record<string, unknown> | undefined;
      try {
        cfg = configJson.trim() ? JSON.parse(configJson) : {};
      } catch (e) {
        setError(`Invalid config JSON: ${(e as Error).message}`);
        setSubmitting(false);
        return;
      }
      await fetchJson(`${serverUrl}/api/v1/triggers`, {
        method: "POST",
        body: JSON.stringify({
          source_name: sourceName,
          target_node_id: targetNodeId,
          target_reasoner: targetReasoner,
          event_types: eventTypes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          secret_env_var: secretEnv,
          config: cfg,
          enabled: true,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New trigger</DialogTitle>
          <DialogDescription>
            Bind an inbound event source to a reasoner. The control plane will
            verify provider signatures using the env-var-named secret.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Source</Label>
            <Select value={sourceName} onValueChange={setSourceName}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a source" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} ({s.kind})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Target node</Label>
              <Input
                value={targetNodeId}
                onChange={(e) => setTargetNodeId(e.target.value)}
                placeholder="my-agent"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Target reasoner</Label>
              <Input
                value={targetReasoner}
                onChange={(e) => setTargetReasoner(e.target.value)}
                placeholder="handle_payment"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Event types (comma-separated, blank = all)</Label>
            <Input
              value={eventTypes}
              onChange={(e) => setEventTypes(e.target.value)}
              placeholder="payment_intent.succeeded, invoice.paid"
            />
          </div>

          {requiresSecret && (
            <div className="grid gap-1.5">
              <Label>Secret env var</Label>
              <Input
                value={secretEnv}
                onChange={(e) => setSecretEnv(e.target.value)}
                placeholder="STRIPE_WEBHOOK_SECRET"
              />
              <p className="text-xs text-muted-foreground">
                The control plane reads this env var at request time — the
                secret value never leaves the server.
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Config (JSON, source-specific)</Label>
            <textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              rows={4}
              className="rounded-md border bg-background px-3 py-2 font-mono text-xs"
            />
            {selectedSource && (
              <p className="text-xs text-muted-foreground">
                Schema:{" "}
                <code>
                  {JSON.stringify(selectedSource.config_schema)}
                </code>
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Events dialog
// ---------------------------------------------------------------------------

function EventsDialog({
  trigger,
  onClose,
}: {
  trigger: Trigger;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<InboundEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetchJson<{ events: InboundEvent[] }>(
        `${serverUrl}/api/v1/triggers/${trigger.id}/events`,
      );
      setEvents(res.events || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [trigger.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function replay(eventId: string) {
    try {
      await fetchJson(
        `${serverUrl}/api/v1/triggers/${trigger.id}/events/${eventId}/replay`,
        { method: "POST" },
      );
      await refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Events for {trigger.source_name}</DialogTitle>
          <DialogDescription>
            Recent inbound events for this trigger. Replay re-dispatches a
            stored payload to the target reasoner.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No events received yet.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">
                    {e.event_type || "(none)"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        e.status === "dispatched"
                          ? "secondary"
                          : e.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {e.status}
                    </Badge>
                    {e.error_message && (
                      <div className="text-xs text-destructive">
                        {e.error_message}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(e.received_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => replay(e.id)}
                    >
                      Replay
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TriggersPage;
