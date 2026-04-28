import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight } from "lucide-react";

interface SourceCatalogEntry {
  name: string;
  kind: "http" | "loop" | string;
  secret_required: boolean;
  config_schema: Record<string, unknown>;
}

interface SourcesStripProps {
  onCreateClick: (sourceName: string) => void;
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

export function SourcesStrip({ onCreateClick }: SourcesStripProps) {
  const [sources, setSources] = useState<SourceCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSources = async () => {
      try {
        setLoading(true);
        const res = await fetchJson<{ sources: SourceCatalogEntry[] }>(
          `${serverUrl}/api/v1/sources`,
        );
        setSources(res.sources || []);
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    };

    loadSources();
  }, []);

  if (loading || sources.length === 0) {
    return null;
  }

  return (
    <Card className="bg-muted/40">
      <CardContent className="p-4">
        <div className="mb-3">
          <CardTitle className="text-sm">Available sources</CardTitle>
          <CardDescription className="text-xs mt-0.5">
            Click to create a trigger for any source
          </CardDescription>
        </div>
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {sources.map((source) => (
              <div
                key={source.name}
                className="shrink-0 flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2"
              >
                <span className="text-xs font-medium">{source.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 ml-1"
                  onClick={() => onCreateClick(source.name)}
                  title={`Create trigger from ${source.name}`}
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
