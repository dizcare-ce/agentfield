import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HitlPendingItem } from "../types";
import { HitlPriorityBadge } from "./HitlPriorityBadge";
import { HitlTagBadge } from "./HitlTagBadge";

interface HitlInboxCardProps {
  item: HitlPendingItem;
}

function formatRelative(timestamp: string | undefined, suffix: "ago" | "left"): string | null {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];

  for (const [unit, size] of units) {
    if (absMs >= size || unit === "minute") {
      const value = Math.round(diffMs / size);
      const label = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(value, unit);
      if (suffix === "left") {
        return label.replace(/^in /, "") + " left";
      }
      return label;
    }
  }

  return null;
}

export function HitlInboxCard({ item }: HitlInboxCardProps) {
  return (
    <Link to={`/hitl/${item.request_id}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle className="truncate">{item.title}</CardTitle>
          <CardDescription className="line-clamp-2">
            {item.description_preview || "No description provided."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {item.tags.map((tag) => (
              <HitlTagBadge key={tag} tag={tag} />
            ))}
            <HitlPriorityBadge priority={item.priority} />
            {formatRelative(item.requested_at, "ago") ? <span>{formatRelative(item.requested_at, "ago")}</span> : null}
            {formatRelative(item.expires_at, "left") ? <span>expires {formatRelative(item.expires_at, "left")}</span> : null}
          </div>
          <ChevronRight className="size-4 shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}
