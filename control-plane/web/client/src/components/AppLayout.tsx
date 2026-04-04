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
        </header>
        <HealthStrip />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
