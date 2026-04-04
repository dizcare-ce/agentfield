# Component Audit & Design System Cleanup

## Current State Summary

- **~200+ components** across 15+ directories
- **UI library:** shadcn/ui over Radix UI — good foundation
- **Styling:** Tailwind CSS — consistent
- **Icons:** Phosphor (with one lucide-react leak in `ExecutionScatterPlot.tsx`)
- **Charts:** Mix of Recharts, hand-rolled SVG, ReactFlow, DeckGL
- **State:** No global state management (all local useState/useRef)
- **Data fetching:** Hand-rolled fetch wrappers with manual caching
- **Real-time:** SSE with custom hooks — works but fragile

---

## 1. Duplication Problems

### JSON Viewers (4 variants!)
| Component | Location | Notes |
|---|---|---|
| `JsonViewer.tsx` | execution/ | Basic tree |
| `EnhancedJsonViewer.tsx` | execution/ | Tree + search |
| `AdvancedJsonViewer.tsx` | execution/ | Full-featured |
| `EnhancedJsonViewer.tsx` | reasoners/ | Separate variant |
| `UnifiedJsonViewer.tsx` | ui/ | Most complete |

**Recommendation:** Keep `UnifiedJsonViewer` only. Delete the other 4.

### Execution Headers (4 variants!)
| Component | Notes |
|---|---|
| `ExecutionHero.tsx` | Full hero layout |
| `ExecutionHeader.tsx` | Standard |
| `EnhancedExecutionHeader.tsx` | With tabs |
| `CompactExecutionHeader.tsx` | Minimal |

**Recommendation:** Keep `CompactExecutionHeader` (used in current pages). Merge needed features from others.

### Status Indicators (5 variants!)
| Component | Notes |
|---|---|
| `StatusIndicator.tsx` (ui/) | Animated dot |
| `status-indicator.tsx` (ui/) | Alternate variant |
| `UnifiedStatusIndicator.tsx` (ui/) | Health + connectivity |
| `StatusIndicator.tsx` (reasoners/) | Reasoner-specific |
| `StatusBadge.tsx` (status/) | Badge style |

**Recommendation:** Keep `UnifiedStatusIndicator` and `StatusBadge`. Delete the rest.

### Data Panels (4 variants!)
| Component | Notes |
|---|---|
| `InputDataPanel.tsx` | Original |
| `OutputDataPanel.tsx` | Original |
| `RedesignedInputDataPanel.tsx` | Redesign |
| `RedesignedOutputDataPanel.tsx` | Redesign |

**Recommendation:** Keep the Redesigned variants only, rename to drop "Redesigned" prefix.

### Sidebars (2 variants)
| Component | Notes |
|---|---|
| `Sidebar.tsx` | Legacy |
| `SidebarNew.tsx` | Current |

**Recommendation:** Delete `Sidebar.tsx`.

---

## 2. Design System Gaps

### Missing Components
- **Toast/Notification system:** Exists but inconsistent — some pages use `notification.tsx` context, others use inline alerts
- **Empty states:** `empty.tsx` exists but many pages have inline empty state JSX
- **Loading states:** `loading-states.tsx` exists but `LoadingSkeleton.tsx` also exists separately
- **Confirmation dialogs:** No reusable confirm dialog — each page builds its own
- **Data table:** No unified data table with sorting/filtering/pagination — each page builds custom tables

### Inconsistent Patterns
- **Error handling:** Some pages show `ErrorState.tsx`, others show inline error messages, others silently fail
- **Polling:** Each hook implements its own polling interval with `setTimeout` — no shared polling primitive
- **SSE reconnection:** `useSSE.ts` has reconnection but individual SSE hooks sometimes have their own reconnection logic too
- **Form validation:** Mix of Zod + autoform in some places, raw state in others

---

## 3. Data Fetching Strategy

### Current: Hand-Rolled
```typescript
// Typical pattern in every hook:
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  fetchData().then(setData).catch(setError).finally(() => setLoading(false));
  const interval = setInterval(fetchData, 30000);
  return () => clearInterval(interval);
}, []);
```

### Problems
- No request deduplication (two components fetching same data = two requests)
- No cache invalidation strategy
- No optimistic updates
- No background refetching
- Manual polling in every hook
- Race conditions with stale closures

### Recommendation: **TanStack Query (React Query)**
- Automatic caching with stale-while-revalidate
- Request deduplication
- Built-in polling via `refetchInterval`
- Optimistic updates for actions
- SSE integration via `queryClient.setQueryData` on events
- Devtools for debugging cache state

**Migration path:** Wrap existing service functions as query functions. Migrate one page at a time.

---

## 4. State Management

### Current: None (Context API only)
- `AuthContext` — API key/admin token
- `ModeContext` — developer/user mode
- `NotificationContext` — toasts

### Assessment
For the current app complexity, no global state library is needed. The real problem is **data fetching state** (solved by React Query), not **UI state**.

### Recommendation: Keep Context API for UI state, adopt React Query for server state
- Auth context → keep
- Mode context → keep
- Notifications → keep but standardize usage
- All data fetching → migrate to React Query

---

## 5. Technical Debt Priority List

### P0 — Must fix before revamp
1. **Adopt React Query** — eliminates hand-rolled caching, polling, race conditions
2. **Deduplicate JSON viewers** — converge on `UnifiedJsonViewer`
3. **Create reusable confirmation dialog** — needed for all new action-heavy pages
4. **Create reusable data table** — sorting, filtering, pagination in one component (TanStack Table)

### P1 — Fix during revamp
5. **Delete legacy components** (old Sidebar, old headers, duplicate panels)
6. **Standardize empty/loading/error states** — one pattern used everywhere
7. **Fix icon leak** — replace lucide import in ExecutionScatterPlot with Phosphor
8. **Standardize SSE hooks** — single SSE manager with per-topic subscriptions

### P2 — Fix after revamp
9. **Add Storybook** — component documentation for contributors
10. **Consider Zustand** — if UI state grows complex with new pages (unlikely)
11. **Unify chart library** — pick Recharts or hand-rolled, not both
12. **Add E2E tests** — Playwright tests for critical user journeys

---

## 6. File Count by Directory

| Directory | Count | Notes |
|---|---|---|
| components/ui/ | ~40 | shadcn primitives — mostly clean |
| components/execution/ | ~25 | Heavy duplication |
| components/WorkflowDAG/ | ~20 | Complex but necessary |
| components/workflow/ | ~15 | Some overlap with WorkflowDAG |
| components/reasoners/ | ~12 | Reasonably clean |
| components/mcp/ | ~6 | Clean |
| components/did/ | ~6 | Clean |
| components/vc/ | ~6 | Clean |
| components/dashboard/ | ~8 | Will change significantly |
| components/authorization/ | ~6 | Clean |
| components/notes/ | ~3 | Clean |
| components/forms/ | ~4 | Clean |
| Top-level components/ | ~20 | Mixed, some dead |
| hooks/ | ~15 | Will migrate to React Query |
| services/ | ~12 | Will become React Query functions |
| pages/ | ~12 | Will restructure |

**Total estimated deletable:** ~40-50 components (after deduplication and cleanup)
