import { Outlet, useLocation } from "react-router-dom";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { AppSidebar } from "./AppSidebar";
import { HealthStrip } from "./HealthStrip";
import { CommandPalette } from "./CommandPalette";
import { useSSEQuerySync } from "@/hooks/useSSEQuerySync";

const routeNames: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/runs": "Runs",
  "/agents": "Agents",
  "/playground": "Playground",
  "/settings": "Settings",
  "/nodes": "Nodes",
  "/reasoners": "Reasoners",
  "/executions": "Executions",
  "/workflows": "Workflows",
};

export function AppLayout() {
  const location = useLocation();
  const currentRoute = Object.entries(routeNames).find(([path]) =>
    location.pathname.startsWith(path)
  );

  // Wire SSE events to TanStack Query cache invalidation so all pages
  // auto-refresh when runs or agent status changes.
  useSSEQuerySync();

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="min-w-0 flex-1">
            <Breadcrumb>
              <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate">
                    {currentRoute?.[1] || "AgentField"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <HealthStrip />
            <Separator orientation="vertical" className="hidden h-4 sm:block" />
            <kbd className="hidden md:inline-flex h-5 shrink-0 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </header>
        <CommandPalette />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
