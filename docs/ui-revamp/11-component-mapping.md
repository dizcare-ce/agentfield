# Component Mapping: Current → Standard shadcn

## Design Decisions (Confirmed)
- **Sidebar:** Minimal icon-rail (collapsed default, expand on hover) — shadcn `Sidebar` with `collapsible="icon"`
- **Icons:** Lucide React (switch from Phosphor) — matches shadcn default
- **Theme:** Dark mode primary, light mode supported — `next-themes` with `defaultTheme="dark"`
- **Typography:** Inter, 14px base — keep existing tokens
- **Components:** Pure standard shadcn — no custom styling beyond variant props
- **Spacing:** `gap-*` everywhere, never `space-y-*`
- **Colors:** Semantic tokens only (`bg-background`, `text-muted-foreground`), never raw values

---

## Part 1: src/components/ui/ — File-by-File Audit

### KEEP (Standard shadcn — already correct)
| File | shadcn Component | Action |
|------|-----------------|--------|
| `alert-dialog.tsx` | AlertDialog | Keep as-is |
| `alert.tsx` | Alert | Keep as-is |
| `badge.tsx` | Badge | Keep as-is |
| `breadcrumb.tsx` | Breadcrumb | Keep as-is |
| `button.tsx` | Button | Keep, verify `data-icon` pattern |
| `card.tsx` | Card | Keep as-is |
| `checkbox.tsx` | Checkbox | Keep as-is |
| `collapsible.tsx` | Collapsible | Keep as-is |
| `command.tsx` | Command | Keep as-is |
| `dialog.tsx` | Dialog | Keep as-is |
| `drawer.tsx` | Drawer (vaul) | Keep as-is |
| `dropdown-menu.tsx` | DropdownMenu | Keep as-is |
| `hover-card.tsx` | HoverCard | Keep as-is |
| `input.tsx` | Input | Keep as-is |
| `label.tsx` | Label | Keep as-is |
| `scroll-area.tsx` | ScrollArea | Keep as-is |
| `select.tsx` | Select | Keep as-is |
| `separator.tsx` | Separator | Keep as-is |
| `sheet.tsx` | Sheet | Keep as-is |
| `sidebar.tsx` | Sidebar | Keep, configure `collapsible="icon"` |
| `skeleton.tsx` | Skeleton | Keep as-is |
| `switch.tsx` | Switch | Keep as-is |
| `table.tsx` | Table | Keep as-is |
| `tabs.tsx` | Tabs | Keep as-is |
| `tooltip.tsx` | Tooltip | Keep as-is |

### DELETE (Duplicates / Legacy / Unused)
| File | Reason | Replaced By |
|------|--------|-------------|
| `animated-tabs.tsx` | Custom sliding indicator — use standard Tabs | `tabs.tsx` |
| `enterprise-card.tsx` | Duplicate card variant system | `card.tsx` with variant prop |
| `icon-bridge.tsx` | Phosphor re-export wrapper | Direct Lucide imports |
| `icon.tsx` | String-key icon lookup | Direct Lucide imports |
| `StatusIndicator.tsx` | Duplicate of status-indicator | `Badge` with status variant |
| `status-indicator.tsx` | Duplicate | `Badge` with dot indicator |
| `typography.tsx` | Custom text components | Tailwind classes: `text-sm`, `text-muted-foreground` |
| `CompactTable.tsx` | Custom dense table | Standard `Table` with `text-sm` |

### MIGRATE (Replace with standard shadcn compositions)
| File | Current | Replace With |
|------|---------|-------------|
| `notification.tsx` | Custom context-based toast | `sonner` (shadcn standard) |
| `SearchBar.tsx` | Custom debounced search | `Input` with search icon (`data-icon`) |
| `FastTableSearch.tsx` | Custom search wrapper | `Input` with debounce hook |
| `FilterSelect.tsx` | Custom dropdown filter | `Select` with `SelectGroup` |
| `TextInput.tsx` | Custom labeled input | `Field` + `FieldLabel` + `Input` |
| `auto-expanding-textarea.tsx` | Custom auto-resize | `Textarea` (or keep if shadcn doesn't auto-resize) |
| `chip-input.tsx` | Custom tag input | Keep (no shadcn equivalent) but clean up |
| `segmented-control.tsx` | Custom pill switcher | `ToggleGroup` + `ToggleGroupItem` |
| `segmented-status-filter.tsx` | Custom status filter | `ToggleGroup` with status variants |
| `time-range-pills.tsx` | Custom time selector | `ToggleGroup` with time options |
| `mode-toggle.tsx` | Theme switcher | Keep but use Lucide icons |
| `ResizableSplitPane.tsx` | Custom resizable | shadcn `Resizable` (add via CLI) |
| `empty.tsx` | Custom empty state | shadcn `Empty` component |
| `ErrorState.tsx` | Custom error display | `Alert` variant="destructive" |
| `loading-states.tsx` | Custom loading variants | `Skeleton` compositions |
| `RestartRequiredBanner.tsx` | Custom banner | `Alert` variant="warning" |

### KEEP BUT CLEAN (Domain-specific, needed)
| File | Purpose | Cleanup Needed |
|------|---------|---------------|
| `copy-button.tsx` | Clipboard copy with feedback | Switch to Lucide icons |
| `data-formatters.tsx` | Shared formatting utils | Keep, not a component |
| `MetricCard.tsx` | Stat display card | Rebuild as `Card` + `CardHeader` + `CardContent` composition |
| `TrendMetricCard.tsx` | Stat + sparkline | Rebuild as `Card` composition with Recharts sparkline |
| `Sparkline.tsx` | SVG inline chart | Keep (custom, no shadcn equivalent) |
| `status-pill.tsx` | Status badge with dot | Migrate to `Badge` with custom dot |
| `tooltip-tag-list.tsx` | Overflow tags | Keep, clean up |
| `UnifiedDataPanel.tsx` | I/O data viewer | Keep, rebuild with `Card` + `Collapsible` |
| `UnifiedJsonViewer.tsx` | JSON tree viewer | Keep (no shadcn equivalent) |

---

## Part 2: New shadcn Components to Add

```bash
npx shadcn@latest add resizable progress toggle toggle-group sonner
```

| Component | Purpose |
|-----------|---------|
| `Resizable` | Split pane layout (Run Detail: trace + step detail) |
| `Progress` | Execution progress bars |
| `Toggle` | Single toggle buttons |
| `ToggleGroup` | View mode switches (Trace/Graph), time range, status filters |
| `Sonner` | Toast notifications (replaces custom notification context) |

---

## Part 3: Domain Components — What Gets Rebuilt

### REMOVE ENTIRELY (features being dropped)
| Directory/Components | Feature |
|---------------------|---------|
| `components/mcp/*` (6 files) | MCP management |
| `components/authorization/*` (6 files) | RBAC management |
| `components/packages/*` (2 files) | Package management |
| `components/did/*` (6 files) | Standalone DID pages → provenance moves to Run Detail |
| `components/vc/*` (5 files) | Standalone VC pages → provenance moves to Run Detail |
| `pages/DIDExplorerPage.tsx` | Standalone DID page |
| `pages/CredentialsPage.tsx` | Standalone credentials page |
| `pages/AuthorizationPage.tsx` | Authorization page |
| `pages/PackagesPage.tsx` | Packages page |
| `pages/WorkflowDeckGLTestPage.tsx` | Dev test page |

**Total files to delete: ~30 component files + 5 page files**

### REBUILD (new pages from product model)
| New Page | Replaces | Key shadcn Components |
|----------|----------|----------------------|
| `pages/DashboardPage.tsx` | `EnhancedDashboardPage` | Alert, Card, Table, Badge, Separator |
| `pages/RunsPage.tsx` | `ExecutionsPage` + `WorkflowsPage` | Table, Badge, ToggleGroup, Input, Select, Checkbox |
| `pages/RunDetailPage.tsx` | `ExecutionDetailPage` + `WorkflowDetailPage` | Resizable, Card, Collapsible, Badge, Tabs, Button, ScrollArea |
| `pages/PlaygroundPage.tsx` | `ReasonerDetailPage` | Resizable, Card, Button, Select, Table |
| `pages/AgentsPage.tsx` | `NodesPage` + `AllReasonersPage` | Card, Collapsible, Badge, Button, Table |
| `pages/SettingsPage.tsx` | `ObservabilityWebhookSettingsPage` | Tabs, Card, Input, Switch, Button |
| `pages/ComparisonPage.tsx` | (new) | Resizable, Card, Table, Badge, ScrollArea |

### NEW Domain Components to Build
| Component | Purpose | shadcn Foundation |
|-----------|---------|-------------------|
| `RunTrace.tsx` | Execution tree with duration bars | Custom (tree layout + `Badge` + `Progress`) |
| `StepDetail.tsx` | Selected step I/O viewer | `Card` + `Collapsible` + `UnifiedJsonViewer` |
| `HealthStrip.tsx` | Sticky system health bar | `Badge` + `Tooltip` (in layout shell) |
| `RunRow.tsx` | Table row for runs list | `TableRow` + `Badge` |
| `ProvenanceSection.tsx` | Per-step VC/DID info | `Collapsible` + `Badge` + copy button |
| `IssuesBanner.tsx` | System issues alert | `Alert` with action buttons |
| `LiveRunCard.tsx` | Active run with progress | `Card` + `Progress` + `Badge` |

### KEEP & MIGRATE (complex components that evolve)
| Current | Action |
|---------|--------|
| `WorkflowDAG/*` (ReactFlow) | Keep ReactFlow integration, but used as toggle view in RunDetail, not default |
| `dashboard/ActivityHeatmap.tsx` | **Delete** — analytics, not debugging |
| `dashboard/KPICard.tsx` | **Delete** → replaced by HealthStrip |
| `dashboard/ExecutionTimeline.tsx` | Keep, move to dashboard analytics section |
| `execution/ExecutionApprovalPanel.tsx` | Keep, integrate into StepDetail as Collapsible section |
| `execution/ExecutionRetryPanel.tsx` | Keep, integrate into StepDetail actions |
| `execution/ExecutionWebhookActivity.tsx` | Keep, move to Settings or Run Detail |
| `reasoners/ExecutionForm.tsx` | Keep, becomes Playground input form |
| `reasoners/PerformanceChart.tsx` | Keep for Playground recent runs |
| `nodes/EnhancedNodeDetailHeader.tsx` | **Delete** → Agents page is simpler |
| `forms/EnvironmentVariableForm.tsx` | Keep for agent config in Agents page |
| `notes/NotesPanel.tsx` | Keep for step detail notes section |

---

## Part 4: Icon Migration (Phosphor → Lucide)

### Migration Strategy
1. Install `lucide-react` (already in package.json)
2. Remove `@phosphor-icons/react` from package.json
3. Delete `icon-bridge.tsx` and `icon.tsx`
4. Find-and-replace all Phosphor imports

### Common Icon Mappings
| Phosphor | Lucide | Usage |
|----------|--------|-------|
| `CaretRight` | `ChevronRight` | Navigation |
| `CaretDown` | `ChevronDown` | Dropdowns |
| `MagnifyingGlass` | `Search` | Search |
| `X` | `X` | Close |
| `Check` | `Check` | Success |
| `Warning` | `AlertTriangle` | Warning |
| `Info` | `Info` | Info |
| `Gear` | `Settings` | Settings |
| `Play` | `Play` | Start/Run |
| `Stop` | `Square` | Stop |
| `ArrowsClockwise` | `RefreshCw` | Refresh/Reconcile |
| `Copy` | `Copy` | Copy to clipboard |
| `Eye` | `Eye` | View |
| `Trash` | `Trash2` | Delete |
| `Plus` | `Plus` | Add |
| `DotsThreeVertical` | `MoreVertical` | More actions |
| `ArrowRight` | `ArrowRight` | Navigate |
| `Lightning` | `Zap` | Active/Fast |
| `CircleNotch` | `Loader2` | Loading spinner |
| `IdentificationCard` | `IdCard` | DID/Identity |
| `ShieldCheck` | `ShieldCheck` | Verified |
| `Graph` | `GitBranch` | Workflow/DAG |
| `Terminal` | `Terminal` | Agent/Code |
| `Cube` | `Box` | Node/Agent |
| `Function` | `FunctionSquare` | Reasoner |
| `Clock` | `Clock` | Duration/Time |
| `CheckCircle` | `CheckCircle` | Success status |
| `XCircle` | `XCircle` | Failed status |
| `Spinner` | `Loader2` | Loading |

### Files Requiring Icon Changes
Every file in `src/components/` that imports from `@phosphor-icons/react`. Estimated: 60-80 files.

Use automated find-and-replace:
```bash
# Find all Phosphor imports
grep -rl "@phosphor-icons/react" src/
```

---

## Part 5: Design Token Alignment

### Keep (Already Good)
- Font: Inter (matches Obra/shadcn)
- Base size: 14px (professional dev tool standard)
- Spacing: 4px grid
- Border radius scale: xs→2xl
- Shadow scale: xs→2xl
- CSS variables for everything

### Clean Up
- Remove custom utility classes from tailwind plugin (`.text-display`, `.text-heading-1`, etc.) → use Tailwind directly: `text-2xl font-semibold tracking-tight`
- Remove `.interactive-hover`, `.focus-ring` utilities → use shadcn component variants
- Remove `.card-elevated` utility → use Card component
- Remove `.status-*` utilities → use Badge variants
- Remove `.gradient-*`, `.glass` utilities → not used in new design
- Remove `.scrollbar-*` utilities → use `ScrollArea` component
- Keep status color tokens (`--status-success`, etc.) — used by Badge variants

### shadcn-Compatible Token Names
Current tokens already follow shadcn conventions:
- `--background`, `--foreground` ✓
- `--card`, `--card-foreground` ✓
- `--primary`, `--primary-foreground` ✓
- `--muted`, `--muted-foreground` ✓
- `--border`, `--input`, `--ring` ✓
- `--sidebar-*` ✓

---

## Part 6: Summary

| Category | Current Files | After Revamp | Delta |
|----------|--------------|-------------|-------|
| shadcn primitives (ui/) | 59 | ~30 | -29 |
| Domain components | ~150 | ~60 | -90 |
| Pages | 12 | 7 | -5 |
| Hooks | ~15 | ~8 (TanStack Query) | -7 |
| Services | ~12 | ~6 (query functions) | -6 |
| **Total estimated** | **~250** | **~110** | **-140 files** |

Net reduction: ~140 files (56% smaller codebase)
