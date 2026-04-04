# Figma shadcn design system vs AgentField web UI — audit

**Figma file:** [shadcn-ui-components-with-variables (Jan 2026)](https://www.figma.com/design/VLABX6KZa3hH7n79Iuqgmj/)  
**File key:** `VLABX6KZa3hH7n79Iuqgmj`  
**Codebase:** [control-plane/web/client](../) — shadcn **new-york**, `baseColor: slate`, tokens in [src/index.css](../src/index.css), theme in [tailwind.config.js](../tailwind.config.js).

**Date:** 2026-04-04  
**Tools:** Figma MCP (`get_metadata`, `get_design_context`, `search_design_system`). `get_variable_defs` was **not usable** in this session (Figma returned: *nothing selected* — requires an active selection in the desktop app).

---

## 1. MCP methodology and limitations


| Method                 | Result                                                                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_metadata`         | **Partial tree only** per `nodeId`. Canvas `0:1` = “Cover”. Canvas `1425:29329` = “shadcn/ui create plugin” doc page with frames `1425:29330`, CTA nodes `1525:3583`, `1441:72`, etc. Full multi-page inventory needs iterating every page id from the file in Figma (not exposed as a single MCP call). |
| `get_variable_defs`    | **Blocked** without a selected layer in Figma Desktop. For a full token dump: open the file, select the variables page or a root frame, re-run MCP, or use **Figma REST** `GET /v1/files/:key/variables/local` with `FIGMA_ACCESS_TOKEN`.                                                                |
| `search_design_system` | **Primary inventory** for component names and *some* variables/styles. Results mix **shadcn kit** with **Material / Apple HIG / iOS** libraries linked in the same community file — filter by `libraryKey` when interpreting.                                                                            |
| `get_design_context`   | **High-signal** for Tailwind-class output and semantic CSS variables on specific nodes. Use `data-node-id` from responses for traceability.                                                                                                                                                              |


**Primary shadcn UI library key** (from search results; use to distinguish kit vs Apple/Material noise):

`lk-e0ffcff14368019c4f30f45401cd233d6cbc5f869988484192d04cbbef801fb0064ef68feaa8a2775ee4f1f05d9a4af1a6d07b2658eac4aefb7afb18728c4066`

---

## 2. Design context samples (spacing / radius / type)

### 2.1 Node `1525:3583` — “View in Shadcn” CTA

Generated reference uses:

- `gap-[var(--gap-1\,5,6px)]` — **6px** gap token
- `px-[var(--px-3,12px)]` — **12px** horizontal padding
- `rounded-[var(--rounded-md,6px)]` — **6px** radius
- `border-[length:var(--border,1px)]`, colors `var(--secondary)`, `var(--border)`, `var(--foreground)`
- Shadow aligned with **shadow-xs** (drop shadow 0,1 / blur 2 / `#0000001A`)
- Typography: **Inter Medium**, **14px**, **line-height 20px** (text-sm / leading-5)

### 2.2 Node `1441:72` — “Try plugin” CTA

- `px-[var(--px-4,16px)]`, `rounded-[var(--rounded-xl,12px)]`, inverted `bg-[var(--foreground)]` / `text-[var(--background)]`
- Typography: **16px** / **28px** line height (different from 1525 — **marketing CTA**, not default shadcn button spec)
- Same **shadow-xs** family

**Implication for AgentField:** Figma encodes **semantic CSS variables** (`--px-*`, `--gap-*`, `--rounded-*`) with px fallbacks. The app uses **shadcn defaults** (`--radius`, Tailwind spacing scale) and **custom compact button sizes** — see §4.

---

## 3. Token gap list (Figma semantics vs AgentField)


| Figma-oriented token (from design context / shadcn create)                | AgentField today                                                               | Gap                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `--px-3` (12px), `--px-4` (16px)                                          | Tailwind `px-3` / `px-4` on inputs/buttons; not named as CSS vars              | **No `--px-*` aliases** — works if classes match, harder to sync globally        |
| `--gap-1,5` → 6px                                                         | Often `gap-2` (8px) in button (`gap-2` in `button.tsx`)                        | **Button icon gap 8px vs Figma 6px** on sample CTA                               |
| `--rounded-md` (6px)                                                      | `--radius: 0.5rem` (8px); `rounded-md` = `calc(var(--radius) - 2px)` → **6px** | **Aligned** for `rounded-md` math; card uses `rounded-xl`                        |
| `--rounded-xl` (12px)                                                     | `rounded-xl` on [card.tsx](../src/components/ui/card.tsx)                    | **Card radius plausibly aligned** with xl                                        |
| Shadow **shadow-xs**                                                      | Mix of `shadow`, `shadow-sm`, `shadow-lg` on button/dialog                     | **No single `--shadow-xs` variable**; dialog uses stronger shadow                |
| Semantic colors `--foreground`, `--background`, `--secondary`, `--border` | Same names in HSL form in `index.css`                                          | **Conceptual parity**; values are slate-tuned + custom `--shell-*` / `--brand-*` |
| Status / JSON / sidebar logo tokens                                       | `--status-*`, `--code-json-*`, `--sidebar-logo*`                               | **Intentional product extensions** — not in community Figma file                 |


**Variables from `search_design_system` (non-shadcn):** Many hits are **macOS 26 / iOS / Material 3 / Simple Design System** (e.g. `Button/Padding - Horizontal`, `Radius/100`). Treat these as **adjacent kits**, not as the Tailwind shadcn source of truth unless a frame explicitly uses them.

---

## 4. Component parity matrix (shadcn kit `lk-e0ffcff…` ↔ `src/components/ui`)

Legend: **Y** = present, **P** = partial / different API, **N** = not as separate primitive, **C** = custom only.


| Figma (shadcn library)           | AgentField `ui/*`                                             | Present | Variant / spacing notes                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button (set)                     | `button.tsx`                                                  | Y       | **Compact defaults** (`h-8`, comment “Compact default for developer tools”). CVA variants; Figma file also contains many **Material** buttons — do not conflate. |
| Card (set)                       | `card.tsx`                                                    | Y       | Extra variants (`surface`, `muted`, `outline`, `ghost`) + `interactive`; `CardHeader` uses `p-6` / `space-y-1.5`.                                                |
| Input Field (set)                | `input.tsx`                                                   | Y       | `h-9`, `px-3`, `rounded-md`, `text-base`/`md:text-sm`.                                                                                                           |
| Textarea Field (set)             | `auto-expanding-textarea.tsx`, patterns                       | P       | No 1:1 named `textarea.tsx`; behavior covered by custom + radix patterns.                                                                                        |
| Select Field (set)               | `select.tsx`                                                  | Y       | Standard shadcn-style select.                                                                                                                                    |
| Checkbox Field (set)             | `checkbox.tsx`                                                | Y       | —                                                                                                                                                                |
| Switch Field (set)               | `switch.tsx`                                                  | Y       | —                                                                                                                                                                |
| Radio Field (set)                | —                                                             | N       | No dedicated `radio-group` file in listing; may be inline or missing.                                                                                            |
| Tabs / Tab (set)                 | `tabs.tsx`                                                    | Y       | —                                                                                                                                                                |
| Accordion Item (set)             | `collapsible.tsx` only                                        | P       | No full `accordion.tsx` in `ui/` list — accordion pattern may be partial.                                                                                        |
| Dialog / Dialog Body             | `dialog.tsx`, `alert-dialog.tsx`                              | Y       | `p-6`, `gap-4`, `sm:rounded-lg`, `shadow-lg`.                                                                                                                    |
| Sheet (shadcn)                   | `sheet.tsx`, `drawer.tsx`                                     | Y       | `drawer.tsx` uses `rounded-t-[10px]` — **arbitrary radius**.                                                                                                     |
| Popover                          | `popover.tsx`                                                 | Y       | —                                                                                                                                                                |
| Table (set)                      | `table.tsx`, `CompactTable.tsx`                               | Y       | `CompactTable` = product-specific.                                                                                                                               |
| Badge                            | `badge.tsx`                                                   | Y       | **Heavy use of `text-[10px]`, `text-[11px]`** — micro-typography not expressed as Figma text styles in audit.                                                    |
| Sidebar (multiple)               | `sidebar.tsx`                                                 | Y       | Widths `13.75rem` / `18rem` / `3rem`; matches shadcn sidebar block, not Figma “Apple Sidebar”.                                                                   |
| Command / Combobox               | `command.tsx`, `filter-*.tsx`, `reasoner-node-combobox.tsx`   | Y / C   | Several **domain-specific** comboboxes.                                                                                                                          |
| Pagination                       | `pagination.tsx`                                              | Y       | —                                                                                                                                                                |
| Breadcrumb                       | `breadcrumb.tsx`                                              | Y       | —                                                                                                                                                                |
| Tooltip / Hover card             | `tooltip.tsx`, `hover-card.tsx`                               | Y       | —                                                                                                                                                                |
| Alert                            | `alert.tsx`                                                   | Y       | Uses **magic numbers** `[&>svg]:translate-y-[-3px]` etc.                                                                                                         |
| Calendar / Date                  | —                                                             | N       | No `calendar.tsx` in inventory; date pickers in Figma are partly Material.                                                                                       |
| Slider Field                     | —                                                             | N       | Not in `ui/` list.                                                                                                                                               |
| Metric / sparkline / JSON viewer | `MetricCard.tsx`, `Sparkline.tsx`, `UnifiedJsonViewer.tsx`, … | C       | **Product components** — no single Figma twin; align tokens only.                                                                                                |


---

## 5. Hotspots — non-standard spacing and arbitrary values (`ui/`)

Examples from ripgrep (non-exhaustive):


| File                              | Pattern                                | Risk                                            |
| --------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `badge.tsx`                       | `text-[10px]`, `text-[11px]`           | Micro-type off Tailwind scale                   |
| `segmented-control.tsx`           | `p-[3px]`                              | Non-token padding                               |
| `filter-multi-combobox.tsx`       | `rounded-[4px]`                        | Non-token radius                                |
| `drawer.tsx`                      | `rounded-t-[10px]`, `w-[100px]`        | Arbitrary                                       |
| `dialog.tsx` / `alert-dialog.tsx` | `left-[50%]`, `slide-out-to-top-[48%]` | Animation positioning — often required by radix |
| `command.tsx`                     | `max-h-[300px]`                        | Arbitrary max height                            |
| `chip-input.tsx`                  | `min-h-[36px]`, `min-w-[80px]`         | Arbitrary                                       |
| `reasoner-node-combobox.tsx`      | `text-[10px]`, `pl-[3.75rem]`          | Dense dev UI                                    |
| `sidebar.tsx`                     | `after:w-[2px]`                        | Hairline drag handle                            |


**Why this drifts from Figma:** The community file expresses **variables + auto-layout**; the app uses **Tailwind utilities + local overrides** for data-dense admin screens. Without mirroring Figma’s `--px-*` / `--gap-*` in `index.css`, **pixel-level parity** will not hold even when semantics match.

---

## 6. Root causes (why UI is not “standardized” to the Figma file)

1. **Multi-library Figma file** — Search returns shadcn, Material, and Apple components; **default** implementation target must be **`libraryKey` = shadcn (`lk-e0ffcff…`)**, not the first search hit.
2. **MCP cannot dump all variables** without Desktop selection or REST — token reconciliation is **incomplete** until `get_variable_defs` or REST variables are captured.
3. **AgentField intentionally compacts chrome** — e.g. `button.tsx` documents smaller default heights for “developer tools”; Figma shadcn kit may assume **marketing/default** densities.
4. **Domain extensions** — status colors, JSON syntax, sidebar brand — **extend** the kit; they will never match a generic shadcn Figma file 1:1.
5. **Custom primitives** — comboboxes, metric cards, DAG views — **compose** tokens but are not in the Figma kit; standardize **spacing scale + radius + type** underneath them first.

---

## 7. Remediation buckets (prioritized)

### A — Global tokens (`index.css` + `tailwind.config.js`)

- Add optional **spacing aliases** mirroring Figma/shadcn create: e.g. `--spacing-px-3: 0.75rem`, or document mapping from `--px-3` → existing scale.
- Add **shadow-xs** as a CSS variable if overlays should match Figma references.
- Re-run **variable export** from Figma (when available) and diff against `:root` / `.dark`.

### B — Primitives (`src/components/ui/*`)

- Reconcile **button** default size vs Figma reference CTAs (gap 6 vs 8, height).
- Replace **arbitrary** `rounded-[4px]`, `p-[3px]` where possible with `rounded-sm`, `p-0.5`, etc.
- Add missing shadcn pieces if desired: **accordion**, **radio-group**, **calendar**, **slider** — then wire to kit spacing.

### C — Feature layouts

- Audit `New*Page`, tables, workflow panels for `gap-*` / `p-*` consistency after A/B stabilize.

---

## 8. Recommended next steps (operational)

1. In **Figma Desktop**: open file `VLABX6KZa3hH7n79Iuqgmj`, select the **variables / foundations** page (or root frame), run **`get_variable_defs`** again via MCP to fill §3 with resolved values.
2. Optionally set **`FIGMA_ACCESS_TOKEN`** and pull `variables` + full `document` JSON for automated diff scripts.
3. When implementing fixes, use **`get_design_context`** on specific **component set** node ids from inside the file (copy `node-id` from Figma URL after selecting the set) — not only the plugin doc page `1425:29329`.

---

## 9. Reference — pages / nodes touched in this audit


| Node ID      | Name / role                                     |
| ------------ | ----------------------------------------------- |
| `0:1`        | Canvas “Cover”                                  |
| `1264:1114`  | Cover rectangle                                 |
| `1425:29329` | Canvas “shadcn/ui create plugin”                |
| `1525:3583`  | CTA “Buttons” — Tailwind + semantic vars (§2.1) |
| `1441:72`    | CTA “Try plugin” (§2.2)                         |


---

## 10. Industry-standard Figma & UX practices (reference)

These are widely cited conventions for **design systems in Figma** and **handoff to code**. They complement the shadcn-specific MCP findings above and explain *why* tokenized spacing and predictable scales matter.

### 10.1 Spatial system (padding, margin, gap)

- **Use a spatial system** — repeatable rules for size and distance so layouts stay consistent and decisions are fewer. The **8pt grid** is the most common default for product UI; **4pt** is often used as a **half-step** for tight gaps (icons, inline chips) or **typography baseline** rhythm so line heights stay on-grid. Odd bases (e.g. 5px) are generally discouraged where they cause alignment or subpixel issues. See [Spacing, grids, and layouts](https://www.designsystems.com/space-grids-and-layouts/) (Design Systems Handbook).
- **Tailwind’s default scale** (`0.25rem` steps → 4px at default root) **aligns with a 4px subgrid**; pairing it with an **8px “major” rhythm** (8, 16, 24, 32…) in design reviews keeps Figma and code aligned.

### 10.2 Layout grids vs auto layout (Figma UX)

- **Layout grids** — columns/rows/baseline for **page-level** structure and alignment. See [Everything you need to know about layout grids in Figma](https://www.figma.com/best-practices/everything-you-need-to-know-about-layout-grids/) (Figma Best Practices).
- **Auto layout** — **internal** component padding, gap, and resizing. Best practice: **grids for frames, auto layout inside components** so spacing does not drift when content changes.
- **shadcn Figma files** typically encode padding/gap as **variables** on auto-layout frames; code should mirror **named tokens** or **fixed scale classes**, not one-off pixels.

### 10.3 Variables / design tokens

- Prefer **semantic names** (`spacing/md`, `color/background`, `radius/md`) over raw values in component specs; organize **collections** (color, space, radius, type). Use **modes** for light/dark with the **same token names**. See common industry summaries on [design tokens in Figma](https://www.voit.io/post/design-tokens-figma) and team governance patterns (e.g. [managing tokens at scale](https://designilo.com/2025/07/10/best-practices-for-managing-design-tokens-across-large-teams-in-figma/)).
- **Three layers** many teams use: **primitive** (raw scale) → **semantic** (intent) → **component** (optional overrides). AgentField today is closest to **semantic HSL in CSS** + **utility classes**; adding explicit **spacing primitives** in CSS or Tailwind theme would match this model.

### 10.4 Typography

- **Type scales** and **line-height** tied to the same base grid (often 4px) improve vertical rhythm. Figma’s [typography systems](https://www.figma.com/best-practices/typography-systems-in-figma/) guidance applies; avoid ad-hoc `text-[10px]` unless defined as a **named caption** token.

### 10.5 How this maps to the shadcn Figma file you use

That file expresses **CSS-variable-oriented** spacing (`--px-*`, `--gap-*`) and **radius** (`--rounded-*`) in MCP output — consistent with **tokenized auto layout**. Industry practice says: treat those as **source of truth** for primitives, keep **semantic** names stable in code, and **sync** via variables export or REST when possible.

---

## 11. What to change everywhere (repo-wide checklist)

A ripgrep pass over `src/` for **arbitrary** Tailwind values (`*-[\d`, `text-[Npx]`, positional `left-[50%]`, etc.) shows **~90+ component/page files** with at least one match — not only `ui/`. High-count examples include **`ComparisonPage.tsx`**, **`RunDetailPage.tsx`**, **`AgentsPage.tsx`**, **`RunsPage.tsx`**, **`EnhancedDashboardPage.tsx`**, **`WorkflowDAG/*`**, **`authorization/*`**, **`sidebar.tsx`**, plus all hotspots in §5.

Use the table below as the **cross-cutting** change list (industry practice → where to act).

| Practice | Change in AgentField |
|----------|----------------------|
| **Tokenized spacing** | Define a **small set** of spacing/radius/shadow CSS variables (or Tailwind `theme.extend.spacing`) aligned to Figma/shadcn (`--px-3`, `--gap-1.5`, `shadow-xs`). Replace **repeat arbitrary** `p-[3px]`, `rounded-[4px]`, `rounded-t-[10px]` with scale tokens where not technically required (Radix animation exceptions documented). |
| **8px rhythm for section layout** | Audit **`pages/*`**, **`AppLayout`**, **`WorkflowDAG`**, **`dashboard/*`**: prefer `gap-4`, `gap-6`, `p-4`, `p-6` over mixed one-offs; document **dense** exceptions (tables, DAG) in a short **density** guideline. |
| **Typography scale** | Replace scattered **`text-[10px]` / `text-[11px]`** with named utilities or CSS vars (e.g. `text-xs` + line-height, or `--text-caption`) in **`badge.tsx`**, **`SearchBar`**, **`reasoner-node-combobox`**, **`Sparkline`**, **`tooltip-tag-list`**, and feature pages using micro-labels. |
| **Component internals** | **`button.tsx`**: reconcile **gap** (6 vs 8) and default **height** with Figma default vs “compact” product decision — pick one standard and document. **`card.tsx`**: keep `p-6` / `space-y-1.5` consistent with token map. **`dialog` / `drawer`**: align **radius** and **shadow** steps to token set. |
| **Feature + auth UI** | **`AccessRulesTab`**, **`AgentTagsTab`**, **`CompactExecutionHeader`**, **`EnhancedWorkflowHeader`**, etc. — refactor repeated spacing to **shared layout primitives** or **section** components to avoid drift. |
| **Workflow DAG** | **`WorkflowNode.tsx`**, **`AgentLegend.tsx`**, **`index.tsx`** — graph UIs often need pixel math; isolate **magic numbers** in a **`dag-tokens.ts`** or CSS variables so the rest of the app stays on the main scale. |
| **Governance / handoff** | Export Figma **variables** (MCP with selection or REST) and store a **mapping table** (Figma name → CSS var / Tailwind key) in this doc or `CONTRIBUTING` for the web client — matches industry **token literacy** practice. |

**Suggested order of work:** **(1)** global tokens + Tailwind aliases → **(2)** `ui/*` primitives → **(3)** highest-traffic pages (`New*`, runs, agents, workflow detail) → **(4)** DAG and specialized views.

---

*This document satisfies the planned deliverable: token gaps, component parity matrix, hotspots, remediation buckets, MCP limitations, industry-standard Figma/UX reference, and a repo-wide change checklist.*