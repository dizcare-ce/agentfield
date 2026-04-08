import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HitlEmptyState } from "../components/HitlEmptyState";
import { HitlInboxCard } from "../components/HitlInboxCard";
import { HitlTagBadge } from "../components/HitlTagBadge";
import { useHitlInbox } from "../hooks/useHitlInbox";
import type { HitlPriority } from "../types";

export function HitlInboxPage() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [priority, setPriority] = useState<HitlPriority | "all">("all");
  const filters = useMemo(() => ({ tags: selectedTags, priority }), [priority, selectedTags]);
  const { items, isLoading, availableTags } = useHitlInbox(filters);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Tasks awaiting your input</h1>
        <p className="text-sm text-muted-foreground">
          Pending human-in-the-loop requests appear here as soon as an execution pauses.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <HitlTagBadge
                key={tag}
                tag={tag}
                active={active}
                onClick={() =>
                  setSelectedTags((current) =>
                    active ? current.filter((entry) => entry !== tag) : [...current, tag],
                  )
                }
              />
            );
          })}
        </div>
        <div className="w-full sm:w-48">
          <Select value={priority} onValueChange={(value) => setPriority(value as HitlPriority | "all")}>
            <SelectTrigger>
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <HitlEmptyState />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <HitlInboxCard key={item.request_id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
