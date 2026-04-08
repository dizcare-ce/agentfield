import { Badge } from "@/components/ui/badge";

interface HitlTagBadgeProps {
  tag: string;
  active?: boolean;
  onClick?: () => void;
}

export function HitlTagBadge({ tag, active, onClick }: HitlTagBadgeProps) {
  return (
    <Badge
      variant={active ? "default" : "secondary"}
      className={onClick ? "cursor-pointer" : undefined}
      onClick={onClick}
    >
      {tag}
    </Badge>
  );
}
