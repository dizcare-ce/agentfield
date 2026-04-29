import { useMemo, useState } from "react";
import { useConnectorInvocations } from "@/hooks/queries/useConnectors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusDot } from "@/components/ui/status-pill";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  JsonHighlightedPre,
} from "@/components/ui/json-syntax-highlight";
import type { ConnectorInvocation } from "@/types/agentfield";

function InvocationDetailDialog({
  invocation,
  open,
  onOpenChange,
}: {
  invocation: ConnectorInvocation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!invocation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StatusDot
              status={invocation.status === "success" ? "success" : "error"}
              className="h-3 w-3"
            />
            {invocation.connector_name} · {invocation.operation_name}
          </DialogTitle>
          <DialogDescription>
            {new Date(invocation.started_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge
                variant={invocation.status === "success" ? "default" : "destructive"}
              >
                {invocation.status}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-sm font-semibold">{invocation.duration_ms}ms</p>
            </div>
            {invocation.http_status && (
              <div>
                <p className="text-xs text-muted-foreground">HTTP Status</p>
                <p className="text-sm font-semibold">{invocation.http_status}</p>
              </div>
            )}
            {invocation.invocation_id && (
              <div>
                <p className="text-xs text-muted-foreground">Invocation ID</p>
                <p className="font-mono text-xs break-all">
                  {invocation.invocation_id}
                </p>
              </div>
            )}
          </div>

          {invocation.inputs && (
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Inputs</h3>
              <div className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3">
                <JsonHighlightedPre data={invocation.inputs} />
              </div>
            </div>
          )}

          {invocation.result && (
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Result</h3>
              <div className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3">
                <JsonHighlightedPre data={invocation.result} />
              </div>
            </div>
          )}

          {invocation.error && (
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Error</h3>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
                <p className="text-sm text-red-900 dark:text-red-100">
                  {invocation.error}
                </p>
              </div>
            </div>
          )}

          {invocation.field_errors && Object.keys(invocation.field_errors).length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-foreground">Field Errors</h3>
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                {Object.entries(invocation.field_errors).map(([field, msg]) => (
                  <p key={field} className="text-sm text-amber-900 dark:text-amber-100">
                    <code className="font-mono text-xs">{field}:</code> {msg}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConnectorInvocationsPage() {
  const [selectedInvocation, setSelectedInvocation] = useState<ConnectorInvocation | null>(null);
  const { data, isLoading, error } = useConnectorInvocations(100);

  const invocations = useMemo(() => {
    return (data?.invocations || []).sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }, [data?.invocations]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">Invocations</h1>
        <p className="text-muted-foreground">
          Recent connector invocations and audit log
        </p>
      </div>

      {error ? (
        <ErrorState
          title="Failed to load invocations"
          description={error instanceof Error ? error.message : "Unknown error"}
        />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : invocations.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No invocations yet</p>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connector</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>HTTP Status</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invocations.map((inv) => (
                <TableRow
                  key={inv.invocation_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedInvocation(inv)}
                >
                  <TableCell className="font-semibold text-foreground">
                    {inv.connector_name}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {inv.operation_name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StatusDot
                        status={inv.status === "success" ? "success" : "error"}
                        className="h-3 w-3"
                      />
                      <Badge
                        variant={
                          inv.status === "success" ? "default" : "destructive"
                        }
                      >
                        {inv.status}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {inv.duration_ms}ms
                  </TableCell>
                  <TableCell>
                    {inv.http_status && (
                      <Badge variant="outline">{inv.http_status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.started_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <InvocationDetailDialog
        invocation={selectedInvocation}
        open={!!selectedInvocation}
        onOpenChange={(open) => !open && setSelectedInvocation(null)}
      />
    </div>
  );
}
