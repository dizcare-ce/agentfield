import { Activity, Bot, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

// This will later use TanStack Query hooks. For now, show static placeholders.
export function HealthStrip() {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-2 text-xs">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Activity className="size-3.5 text-green-500" />
              <span className="text-muted-foreground">LLM</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Healthy
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>All LLM endpoints responding</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Bot className="size-3.5 text-green-500" />
              <span className="text-muted-foreground">Agents</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                0 online
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>Agent fleet status</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Layers className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Queue</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                0 running
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>Execution queue status</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
