import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SourceCatalogEntry {
  name: string;
  kind: "http" | "loop" | string;
  secret_required: boolean;
  config_schema: Record<string, unknown>;
}

interface NewTriggerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceCatalogEntry[];
  defaultSourceName?: string;
  onCreated: () => void;
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
  return res.json();
}

export function NewTriggerDialog({
  open,
  onOpenChange,
  sources,
  defaultSourceName,
  onCreated,
}: NewTriggerDialogProps) {
  const [sourceName, setSourceName] = useState(
    defaultSourceName || sources[0]?.name || "",
  );
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

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen === false) {
      setTargetNodeId("");
      setTargetReasoner("");
      setEventTypes("");
      setSecretEnv("");
      setConfigJson("{}");
      setError(null);
    }
    onOpenChange(newOpen);
  };

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
      handleOpenChange(false);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
              className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
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
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
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
