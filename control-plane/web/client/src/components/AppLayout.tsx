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

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar/30 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {currentRoute?.[1] || "AgentField"}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 text-[10px] font-mono text-muted-foreground">
              ⌘K
            </kbd>
          </div>
        </header>
        <CommandPalette />
        <HealthStrip />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
