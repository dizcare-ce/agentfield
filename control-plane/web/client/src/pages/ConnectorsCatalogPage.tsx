import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConnectors } from "@/hooks/queries/useConnectors";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Connector } from "@/types/agentfield";

function ConnectorIcon({ connector }: { connector: Connector }) {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
        <span className="text-xs font-bold text-muted-foreground">
          {connector.display.slice(0, 2).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={connector.icon_url}
      alt={connector.display}
      onError={() => setImageError(true)}
      className="h-12 w-12 rounded-lg object-cover"
    />
  );
}

function ConnectorCard({ connector }: { connector: Connector }) {
  const navigate = useNavigate();

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:border-foreground/30",
        "border-l-4"
      )}
      style={{
        borderLeftColor: connector.brand_color || "hsl(var(--border))",
      }}
      onClick={() => navigate(`/connectors/${connector.name}`)}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ConnectorIcon connector={connector} />
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-foreground truncate">
                {connector.display}
              </h3>
              <p className="text-sm text-muted-foreground truncate">
                {connector.category}
              </p>
            </div>
          </div>
          {!connector.has_inbound && (
            <Badge variant="secondary" className="shrink-0">
              Outbound
            </Badge>
          )}
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {connector.description}
        </p>

        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {connector.op_count} {connector.op_count === 1 ? "operation" : "operations"}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

function ConnectorCardSkeleton() {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: "hsl(var(--muted))" }}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-6 w-32" />
      </div>
    </Card>
  );
}

export function ConnectorsCatalogPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, error } = useConnectors();

  const filteredConnectors = useMemo(() => {
    if (!data?.connectors) return [];
    const query = searchQuery.toLowerCase();
    return data.connectors.filter(
      (c) =>
        c.display.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query) ||
        c.description.toLowerCase().includes(query)
    );
  }, [data?.connectors, searchQuery]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-foreground">Connectors</h1>
        <p className="text-muted-foreground">
          Browse and invoke external connectors
        </p>
      </div>

      <Input
        placeholder="Search connectors by name, category, or description..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-sm"
      />

      {error ? (
        <ErrorState
          title="Failed to load connectors"
          description={error instanceof Error ? error.message : "Unknown error"}
        />
      ) : isLoading ? (
        <div className="grid auto-rows-max gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <ConnectorCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredConnectors.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-muted-foreground">
            {searchQuery ? "No connectors found matching your search" : "No connectors available"}
          </p>
          {!searchQuery && (
            <a
              href="https://agentfield.ai/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary underline hover:no-underline"
            >
              Learn how to add connectors
            </a>
          )}
        </div>
      ) : (
        <div className="grid auto-rows-max gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredConnectors.map((connector) => (
            <ConnectorCard key={connector.name} connector={connector} />
          ))}
        </div>
      )}
    </div>
  );
}
