import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { RootRedirect } from "./components/RootRedirect";
import { ModeProvider } from "./contexts/ModeContext";
import { ThemeProvider } from "./components/theme-provider";
import { useFocusManagement } from "./hooks/useFocusManagement";
import { AppLayout } from "./components/AppLayout";
import { AllReasonersPage } from "./pages/AllReasonersPage.tsx";
import { EnhancedDashboardPage } from "./pages/EnhancedDashboardPage";
import { NewDashboardPage } from "./pages/NewDashboardPage";
import { ExecutionsPage } from "./pages/ExecutionsPage";
import { EnhancedExecutionDetailPage } from "./pages/EnhancedExecutionDetailPage";
import { EnhancedWorkflowDetailPage } from "./pages/EnhancedWorkflowDetailPage";
import { NodeDetailPage } from "./pages/NodeDetailPage";
import { NodesPage } from "./pages/NodesPage";
import { ReasonerDetailPage } from "./pages/ReasonerDetailPage.tsx";
import { WorkflowsPage } from "./pages/WorkflowsPage.tsx";
import { NewSettingsPage } from "./pages/NewSettingsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { RunsPage } from "./pages/RunsPage";
import { PlaygroundPage } from "./pages/PlaygroundPage";
import { AuthProvider } from "./contexts/AuthContext";
import { AuthGuard } from "./components/AuthGuard";
import { queryClient } from "./lib/query-client";

function AppContent() {
  useFocusManagement();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/dashboard" element={<NewDashboardPage />} />
        <Route path="/dashboard/legacy" element={<EnhancedDashboardPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/nodes/:nodeId" element={<NodeDetailPage />} />
        <Route path="/reasoners/all" element={<AllReasonersPage />} />
        <Route path="/reasoners/:fullReasonerId" element={<ReasonerDetailPage />} />
        <Route path="/executions" element={<ExecutionsPage />} />
        <Route path="/executions/:executionId" element={<EnhancedExecutionDetailPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/workflows/:workflowId" element={<EnhancedWorkflowDetailPage />} />
        <Route path="/settings" element={<NewSettingsPage />} />
        <Route path="/settings/observability-webhook" element={<Navigate to="/settings" replace />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/runs" element={<RunsPage />} />
        <Route path="/runs/:runId" element={<div className="text-muted-foreground">Run Detail — coming soon</div>} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/playground/:reasonerId" element={<PlaygroundPage />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <ModeProvider>
          <AuthProvider>
            <AuthGuard>
              <Router basename={import.meta.env.VITE_BASE_PATH || "/ui"}>
                <AppContent />
              </Router>
            </AuthGuard>
          </AuthProvider>
        </ModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
