import { useState } from "react";
import { useParams } from "react-router-dom";
import { useConnectorDetail } from "@/hooks/queries/useConnectors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { StatusDot } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectorOpSheet } from "@/components/connectors/ConnectorOpSheet";
import type { ConnectorOperation } from "@/types/agentfield";

function ConnectorIcon({ iconUrl }: { iconUrl: string }) {
  const [error, setError] = useState(false);
  if (error) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
        <span className="text-xs font-bold text-muted-foreground">Icon</span>
      </div>
    );
  }
  return (
    <img
      src={iconUrl}
      alt="connector"
      onError={() => setError(true)}
      className="h-16 w-16 rounded-lg object-cover"
    />
  );
}

function HTTPMethodBadge({ method }: { method: string }) {
  const variants: Record<string, string> = {
    GET: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
    POST: "bg-green-500/20 text-green-700 dark:text-green-400",
    PUT: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
    PATCH: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
    DELETE: "bg-red-500/20 text-red-700 dark:text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-1 text-xs font-semibold",
        variants[method] || variants.GET
      )}
    >
      {method}
    </span>
  );
}

export function ConnectorDetailPage() {
  const { name } = useParams<{ name: string }>();
  const [selectedOp, setSelectedOp] = useState<ConnectorOperation | null>(null);
  const { data: connector, isLoading, error } = useConnectorDetail(name || "");

  if (error) {
    return (
      <ErrorState
        title="Failed to load connector"
        description={error instanceof Error ? error.message : "Unknown error"}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-20 w-20 rounded-lg" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (!connector) {
    return (
      <ErrorState
        title="Connector not found"
        description={`No connector named "${name}"`}
      />
    );
  }

  const authConfigured = connector.auth.secret_set;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start gap-4">
        <ConnectorIcon iconUrl={connector.icon_url} />
        <div className="flex flex-1 flex-col gap-2">
          <h1 className="text-2xl font-bold text-foreground">
            {connector.display}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{connector.category}</Badge>
            <Badge variant="outline">
              {connector.operations.length}{" "}
              {connector.operations.length === 1 ? "operation" : "operations"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{connector.description}</p>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-3">
          <StatusDot
            status={authConfigured ? "success" : "warning"}
            className="h-3 w-3"
          />
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">
              {authConfigured ? "Credentials configured" : "Credentials needed"}
            </p>
            {!authConfigured && (
              <p className="text-xs text-muted-foreground">
                Set{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {connector.auth.secret_env}
                </code>{" "}
                environment variable on the control plane
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-foreground">Operations</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Display</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connector.operations.map((op) => (
                <TableRow
                  key={op.name}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedOp(op)}
                >
                  <TableCell>
                    <HTTPMethodBadge method={op.method} />
                  </TableCell>
                  <TableCell className="font-mono text-sm font-semibold text-foreground">
                    {op.name}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {op.display}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {op.tags?.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOp(op);
                          }}
                        >
                          Try it
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedOp && (
        <ConnectorOpSheet
          connector={connector}
          operation={selectedOp}
          onClose={() => setSelectedOp(null)}
        />
      )}
    </div>
  );
}
