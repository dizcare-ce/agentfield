import { Badge } from "@/components/ui/badge";
import type { HitlPriority } from "../types";

interface HitlPriorityBadgeProps {
  priority: HitlPriority;
}

const variantByPriority: Record<HitlPriority, "secondary" | "outline" | "default" | "destructive"> = {
  low: "outline",
  normal: "secondary",
  high: "default",
  urgent: "destructive",
};

export function HitlPriorityBadge({ priority }: HitlPriorityBadgeProps) {
  return <Badge variant={variantByPriority[priority]}>{priority}</Badge>;
}
