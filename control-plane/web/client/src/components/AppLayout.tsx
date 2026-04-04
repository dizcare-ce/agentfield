import { Link, Outlet, useLocation, useParams } from "react-router-dom";
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
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
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
  "/verify": "Verify",
  "/access": "Access management",
  "/settings": "Settings",
  "/nodes": "Nodes",
  "/reasoners": "Reasoners",
  "/executions": "Executions",
  "/workflows": "Workflows",
};

/** Match the longest configured section prefix so `/dashboard/legacy` maps to `/dashboard`. */
function longestSectionPath(pathname: string): string | null {
  const paths = Object.keys(routeNames).sort((a, b) => b.length - a.length);
  for (const p of paths) {
    if (pathname === p || pathname.startsWith(`${p}/`)) {
      return p;
    }
  }
  return null;
}

function shortResourceId(id: string, tailChars = 8): string {
  const t = Math.max(4, tailChars);
  if (id.length <= t + 1) return id;
  return `…${id.slice(-t)}`;
}

type HeaderCrumb = { label: string; to?: string };

/**
 * On section index routes the sidebar already shows the active item, so the header
 * title was redundant. Hide it there; use a real trail on nested routes (back via link).
 */
function resolveHeaderCrumbs(
  pathname: string,
  params: Readonly<Partial<Record<string, string | undefined>>>,
): { mode: "hidden" } | { mode: "trail"; crumbs: HeaderCrumb[] } {
  const section = longestSectionPath(pathname);
  if (!section) {
    return { mode: "trail", crumbs: [{ label: "AgentField" }] };
  }

  const sectionTitle = routeNames[section]!;
  const rest = pathname.slice(section.length).replace(/^\//, "");
  if (!rest) {
    return { mode: "hidden" };
  }

  const parts = rest.split("/").filter(Boolean);

  if (section === "/runs") {
    if (parts[0] === "compare") {
      return {
        mode: "trail",
        crumbs: [
          { label: sectionTitle, to: section },
          { label: "Compare" },
        ],
      };
    }
    const runId = params.runId ?? parts[0];
    if (runId) {
      return {
        mode: "trail",
        crumbs: [
          { label: sectionTitle, to: section },
          { label: shortResourceId(runId) },
        ],
      };
    }
  }

  if (section === "/playground" && parts[0]) {
    const reasonerId = params.reasonerId ?? parts[0];
    return {
      mode: "trail",
      crumbs: [
        { label: sectionTitle, to: section },
        { label: shortResourceId(reasonerId, 14) },
      ],
    };
  }

  if (section === "/dashboard" && parts[0] === "legacy") {
    return {
      mode: "trail",
      crumbs: [
        { label: sectionTitle, to: section },
        { label: "Classic dashboard" },
      ],
    };
  }

  const last = parts[parts.length - 1] ?? rest;
  const display =
    last.length > 24 ? shortResourceId(last, 10) : last.replace(/-/g, " ");
  const pageLabel =
    display.length > 0
      ? display.charAt(0).toUpperCase() + display.slice(1)
      : "Page";

  return {
    mode: "trail",
    crumbs: [{ label: sectionTitle, to: section }, { label: pageLabel }],
  };
}

export function AppLayout() {
  const location = useLocation();
  const params = useParams();
  const header = resolveHeaderCrumbs(location.pathname, params);

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
            {header.mode === "hidden" ? (
              <div className="min-h-5" aria-hidden="true" />
            ) : (
              <>
                {/* Narrow viewports: only the leaf — sidebar already shows section; saves space for status strip. */}
                <Breadcrumb className="min-w-0 sm:hidden">
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbPage className="truncate">
                        {header.crumbs[header.crumbs.length - 1]!.label}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <Breadcrumb className="hidden min-w-0 sm:block">
                  <BreadcrumbList className="flex-nowrap">
                    {header.crumbs.map((crumb, i) => (
                      <span key={`${crumb.label}-${i}`} className="contents">
                        {i > 0 ? <BreadcrumbSeparator /> : null}
                        <BreadcrumbItem>
                          {crumb.to && i < header.crumbs.length - 1 ? (
                            <BreadcrumbLink asChild>
                              <Link to={crumb.to}>{crumb.label}</Link>
                            </BreadcrumbLink>
                          ) : (
                            <BreadcrumbPage className="truncate">
                              {crumb.label}
                            </BreadcrumbPage>
                          )}
                        </BreadcrumbItem>
                      </span>
                    ))}
                  </BreadcrumbList>
                </Breadcrumb>
              </>
            )}
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
