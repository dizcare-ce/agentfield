import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompactTable } from "@/components/ui/CompactTable";
import { CopyButton } from "@/components/ui/copy-button";
import { Switch } from "@/components/ui/switch";
import { Plus, RadioTower } from "@/components/ui/icon-bridge";
import { NewTriggerDialog } from "@/components/triggers/NewTriggerDialog";
import { SourcesStrip } from "@/components/triggers/SourcesStrip";
import { TriggerSheet } from "@/components/triggers/TriggerSheet";

export interface SourceCatalogEntry {
  name: string;
  kind: "http" | "loop" | string;
  secret_required: boolean;
  config_schema: Record<string, unknown>;
}

export interface Trigger {
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
  return res.json() as Promise<T>;
}

function publicIngestUrl(triggerId: string): string {
  return `${serverUrl}/sources/${triggerId}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function TriggersPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedTriggerId = searchParams.get("trigger");
  const [sources, setSources] = useState<SourceCatalogEntry[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyTriggerId, setBusyTriggerId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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

  const selectedTrigger = useMemo(
    () => triggers.find((trigger) => trigger.id === selectedTriggerId) ?? null,
    [selectedTriggerId, triggers],
  );

  const sortedTriggers = useMemo(() => {
    return [...triggers].sort((a, b) => {
      const left = String(a[sortBy as keyof Trigger] ?? "");
      const right = String(b[sortBy as keyof Trigger] ?? "");
      return sortOrder === "asc"
        ? left.localeCompare(right)
        : right.localeCompare(left);
    });
  }, [sortBy, sortOrder, triggers]);

  const openTrigger = useCallback(
    (trigger: Trigger) => {
      navigate(`/triggers?trigger=${encodeURIComponent(trigger.id)}`);
    },
    [navigate],
  );

  const closeTrigger = useCallback(() => {
    navigate("/triggers");
  }, [navigate]);

  async function updateTrigger(triggerId: string, patch: Partial<Trigger>) {
    try {
      setBusyTriggerId(triggerId);
      await fetchJson(`${serverUrl}/api/v1/triggers/${triggerId}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyTriggerId(null);
    }
  }

  async function deleteTrigger(trigger: Trigger) {
    if (trigger.managed_by === "code") {
      return;
    }
    if (!window.confirm(`Delete trigger ${trigger.id}?`)) {
      return;
    }
    try {
      setBusyTriggerId(trigger.id);
      await fetchJson(`${serverUrl}/api/v1/triggers/${trigger.id}`, {
        method: "DELETE",
      });
      closeTrigger();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyTriggerId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-background p-6 text-foreground">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <RadioTower className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Triggers
            </h1>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Inbound sources that dispatch provider events, schedules, and
            generic webhooks into reasoners.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          New trigger
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SourcesStrip
        sources={sources}
        triggers={triggers}
        loading={loading}
        onCreate={() => setCreateOpen(true)}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle>Active triggers</CardTitle>
              <CardDescription>
                Select a trigger to inspect events, configuration, secrets, and
                dispatch activity.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="w-fit">
              {triggers.length} total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <CompactTable
            data={sortedTriggers}
            loading={loading}
            hasMore={false}
            isFetchingMore={false}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={(field, order) => {
              setSortBy(field);
              setSortOrder(order ?? (sortBy === field && sortOrder === "asc" ? "desc" : "asc"));
            }}
            onRowClick={openTrigger}
            getRowKey={(trigger) => trigger.id}
            gridTemplate="minmax(0,1.2fr) minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,0.6fr) minmax(0,0.9fr)"
            rowHeight={48}
            emptyState={{
              title: "No triggers yet",
              description: "Create a UI-managed trigger or declare one in agent code.",
              action: {
                label: "New trigger",
                onClick: () => setCreateOpen(true),
                icon: <Plus className="h-4 w-4" />,
              },
            }}
            columns={[
              {
                key: "source_name",
                header: "Source",
                sortable: true,
                render: (trigger) => (
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">
                      {trigger.source_name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {trigger.id}
                    </span>
                  </div>
                ),
              },
              {
                key: "target_node_id",
                header: "Target",
                sortable: true,
                render: (trigger) => (
                  <div className="min-w-0 truncate font-mono text-xs">
                    {trigger.target_node_id}.{trigger.target_reasoner}
                  </div>
                ),
              },
              {
                key: "id",
                header: "Public URL",
                render: (trigger) => (
                  <div
                    className="flex min-w-0 items-center gap-2"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                      {publicIngestUrl(trigger.id)}
                    </span>
                    <CopyButton
                      value={publicIngestUrl(trigger.id)}
                      size="icon-sm"
                      tooltip="Copy public URL"
                    />
                  </div>
                ),
              },
              {
                key: "managed_by",
                header: "Owner",
                sortable: true,
                render: (trigger) => (
                  <Badge variant={trigger.managed_by === "code" ? "secondary" : "outline"}>
                    {trigger.managed_by}
                  </Badge>
                ),
              },
              {
                key: "enabled",
                header: "Enabled",
                sortable: true,
                align: "center",
                render: (trigger) => (
                  <div onClick={(event) => event.stopPropagation()}>
                    <Switch
                      checked={trigger.enabled}
                      disabled={busyTriggerId === trigger.id}
                      onCheckedChange={(enabled) =>
                        void updateTrigger(trigger.id, { enabled })
                      }
                    />
                  </div>
                ),
              },
              {
                key: "updated_at",
                header: "Updated",
                sortable: true,
                render: (trigger) => (
                  <span className="truncate text-xs text-muted-foreground">
                    {formatDate(trigger.updated_at)}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <NewTriggerDialog
        open={createOpen}
        sources={sources}
        serverUrl={serverUrl}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          void refresh();
        }}
      />

      <TriggerSheet
        open={Boolean(selectedTrigger)}
        trigger={selectedTrigger}
        serverUrl={serverUrl}
        publicUrl={selectedTrigger ? publicIngestUrl(selectedTrigger.id) : ""}
        busy={selectedTrigger ? busyTriggerId === selectedTrigger.id : false}
        onOpenChange={(open) => {
          if (!open) {
            closeTrigger();
          }
        }}
        onEnabledChange={(enabled) => {
          if (selectedTrigger) {
            void updateTrigger(selectedTrigger.id, { enabled });
          }
        }}
        onDelete={() => {
          if (selectedTrigger) {
            void deleteTrigger(selectedTrigger);
          }
        }}
      />
    </div>
  );
}

export default TriggersPage;
