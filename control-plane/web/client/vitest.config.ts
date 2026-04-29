import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        globals: true,
        coverage: {
            all: true,
            provider: "v8",
            include: ["src/**/*.{ts,tsx}"],
            exclude: [
                "dist/**",
                "node_modules/**",
                "src/test/**",
                "src/**/*.d.ts",
                // WIP control-plane UI scaffold (large surface, not yet exercised by tests).
                // Remove entries here as components gain real coverage.
                "src/components/AccessibilityEnhancements.tsx",
                "src/components/AgentNodesTable.tsx",
                "src/components/Compact*.tsx",
                "src/components/DensityToggle.tsx",
                "src/components/EnhancedExecutionsTable.tsx",
                "src/components/ExecutionCard.tsx",
                "src/components/ExecutionStatsCard.tsx",
                "src/components/ExecutionViewTabs.tsx",
                "src/components/HealthBadge.tsx",
                "src/components/LoadingSkeleton.tsx",
                "src/components/Navigation.tsx",
                "src/components/Navigation/**",
                "src/components/NodesList.tsx",
                "src/components/NodesStatusSummary.tsx",
                "src/components/NodesVirtualList.tsx",
                "src/components/ReasonersList.tsx",
                "src/components/ReasonersSkillsTable.tsx",
                "src/components/ServerlessRegistrationModal.tsx",
                "src/components/SkillsList.tsx",
                "src/components/WorkflowsTable.tsx",
                "src/components/mcp/**",
                "src/components/workflow/Enhanced*.tsx",
                "src/hooks/useFocusManagement.ts",
                "src/pages/AllReasonersPage.tsx",
                "src/pages/Enhanced*.tsx",
                "src/pages/ExecutionDetailPage.tsx",
                "src/pages/ExecutionsPage.tsx",
                "src/pages/NodeDetailPage.tsx",
                "src/pages/NodesPage.tsx",
                "src/pages/ObservabilityWebhookSettingsPage.tsx",
                "src/pages/ReasonerDetailPage.tsx",
                "src/pages/RedesignedExecutionDetailPage.tsx",
                "src/pages/WorkflowDetailPage.tsx",
                "src/pages/WorkflowsPage.tsx",
                "src/services/searchService.ts",
            ],
            reporter: ["text-summary", "json-summary", "cobertura"],
            reportsDirectory: "coverage",
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
});
