# Design System Audit: Current vs Standard shadcn/ui

Based on the Figma reference file (shadcn/ui components with Tailwind classes, Jan 2026)
and the official shadcn/ui theming documentation.

**Important: Color format decision**
- Our project uses **Tailwind v3** (not v4)
- The Figma reference file uses **HSL format** (Tailwind v3 compatible)
- shadcn v4 uses OKLCH but that requires Tailwind v4
- **We use HSL** to match our Tailwind version and Figma reference

## Decision: Follow Official shadcn/ui Defaults Exactly

No custom design system. Standard shadcn. The Figma file confirms this approach:
it maps Tailwind CSS utility classes directly to Figma variables, with semantic
color tokens, light/dark modes via Figma variable modes, and standard spacing.

---

## 1. Color System — What Changes

### Current (WRONG): Custom HSL/raw variables
Our `index.css` and `foundation.css` define custom tokens like:
- `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--bg-elevated`, `--bg-overlay`
- `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-quaternary`
- `--nav-background`, `--nav-elevated`, `--nav-text-primary`, etc.
- `--accent-primary`, `--accent-secondary`
- `--card-hover`, `--card-border`

These are **non-standard** and create a parallel color system alongside shadcn's tokens.

### Target (CORRECT): Official shadcn HSL tokens (Tailwind v3 compatible)

Matches the Figma reference file exactly. HSL values without `hsl()` wrapper,
composed in Tailwind via `hsl(var(--token))`.

**Dark mode (`.dark`) — PRIMARY for our app:**
```css
.dark {
  --background:              222.2 84% 4.9%;     /* #09090b near-black */
  --foreground:              210 40% 98%;         /* #f8fafc near-white */
  --card:                    222.2 84% 4.9%;      /* #09090b */
  --card-foreground:         210 40% 98%;         /* #f8fafc */
  --popover:                 222.2 84% 4.9%;
  --popover-foreground:      210 40% 98%;
  --primary:                 210 40% 98%;         /* #f8fafc inverted */
  --primary-foreground:      222.2 47.4% 11.2%;   /* #0f172a */
  --secondary:               217.2 32.6% 17.5%;   /* #1e293b */
  --secondary-foreground:    210 40% 98%;
  --muted:                   217.2 32.6% 17.5%;   /* #1e293b */
  --muted-foreground:        215 20.2% 65.1%;     /* #94a3b8 */
  --accent:                  217.2 32.6% 17.5%;   /* #1e293b */
  --accent-foreground:       210 40% 98%;
  --destructive:             0 62.8% 30.6%;       /* #7f1d1d dark red */
  --destructive-foreground:  210 40% 98%;
  --border:                  217.2 32.6% 17.5%;   /* #1e293b */
  --input:                   217.2 32.6% 17.5%;
  --ring:                    212.7 26.8% 83.9%;   /* #cbd5e1 */
  --chart-1:                 220 70% 50%;
  --chart-2:                 160 60% 45%;
  --chart-3:                 30 80% 55%;
  --chart-4:                 280 65% 60%;
  --chart-5:                 340 75% 55%;
  --sidebar-background:      240 5.9% 10%;        /* #18181b */
  --sidebar-foreground:      240 4.8% 95.9%;      /* #f4f4f5 */
  --sidebar-primary:         224.3 76.3% 48%;     /* #2563eb blue */
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent:          240 3.7% 15.9%;      /* #27272a */
  --sidebar-accent-foreground: 240 4.8% 95.9%;
  --sidebar-border:          240 3.7% 15.9%;
  --sidebar-ring:            217.2 91.2% 59.8%;
}
```

**Light mode (`:root`):**
```css
:root {
  --radius: 0.5rem;
  --background:              0 0% 100%;
  --foreground:              222.2 84% 4.9%;
  --card:                    0 0% 100%;
  --card-foreground:         222.2 84% 4.9%;
  --popover:                 0 0% 100%;
  --popover-foreground:      222.2 84% 4.9%;
  --primary:                 222.2 47.4% 11.2%;
  --primary-foreground:      210 40% 98%;
  --secondary:               210 40% 96.1%;
  --secondary-foreground:    222.2 47.4% 11.2%;
  --muted:                   210 40% 96.1%;
  --muted-foreground:        215.4 16.3% 46.9%;
  --accent:                  210 40% 96.1%;
  --accent-foreground:       222.2 47.4% 11.2%;
  --destructive:             0 84.2% 60.2%;
  --destructive-foreground:  210 40% 98%;
  --border:                  214.3 31.8% 91.4%;
  --input:                   214.3 31.8% 91.4%;
  --ring:                    222.2 84% 4.9%;
  --chart-1:                 12 76% 61%;
  --chart-2:                 173 58% 39%;
  --chart-3:                 197 37% 24%;
  --chart-4:                 43 74% 66%;
  --chart-5:                 27 87% 67%;
  --sidebar-background:      0 0% 98%;
  --sidebar-foreground:      240 5.3% 26.1%;
  --sidebar-primary:         240 5.9% 10%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent:          240 4.8% 95.9%;
  --sidebar-accent-foreground: 240 5.9% 10%;
  --sidebar-border:          220 13% 91%;
  --sidebar-ring:            217.2 91.2% 59.8%;
```

**Dark mode (`.dark`) — PRIMARY mode for our app:**
```css
  --background:              222.2 84% 4.9%;
  --foreground:              210 40% 98%;
  --card:                    222.2 84% 4.9%;
  --card-foreground:         210 40% 98%;
  --popover:                 222.2 84% 4.9%;
  --popover-foreground:      210 40% 98%;
  --primary:                 210 40% 98%;
  --primary-foreground:      222.2 47.4% 11.2%;
  --secondary:               217.2 32.6% 17.5%;
  --secondary-foreground:    210 40% 98%;
  --muted:                   217.2 32.6% 17.5%;
  --muted-foreground:        215 20.2% 65.1%;
  --accent:                  217.2 32.6% 17.5%;
  --accent-foreground:       210 40% 98%;
  --destructive:             0 62.8% 30.6%;
  --destructive-foreground:  210 40% 98%;
  --border:                  217.2 32.6% 17.5%;
  --input:                   217.2 32.6% 17.5%;
  --ring:                    212.7 26.8% 83.9%;
  --chart-1:                 220 70% 50%;
  --chart-2:                 160 60% 45%;
  --chart-3:                 30 80% 55%;
  --chart-4:                 280 65% 60%;
  --chart-5:                 340 75% 55%;
  --sidebar-background:      240 5.9% 10%;
  --sidebar-foreground:      240 4.8% 95.9%;
  --sidebar-primary:         224.3 76.3% 48%;
  --sidebar-primary-foreground: 0 0% 100%;
  --sidebar-accent:          240 3.7% 15.9%;
  --sidebar-accent-foreground: 240 4.8% 95.9%;
  --sidebar-border:          240 3.7% 15.9%;
  --sidebar-ring:            217.2 91.2% 59.8%;
```

### Custom Additions We Keep (for domain needs)
Only status colors — shadcn doesn't define these, but we need them for execution states:
```css
/* Status colors (our addition, follows shadcn HSL convention) */
--status-success: 142 76% 36%;    /* green-600 */
--status-warning: 38 92% 50%;     /* amber-500 */
--status-error: 0 84.2% 60.2%;    /* same as destructive light */
--status-info: 199 89% 48%;       /* sky-500 */
```

### What Gets DELETED from CSS
- ALL `--bg-*` custom tokens (bg-primary, bg-secondary, bg-tertiary, bg-elevated, bg-overlay, bg-hover, bg-active)
- ALL `--text-*` custom tokens (text-primary through text-disabled, text-inverse)
- ALL `--nav-*` tokens (entire nav color system)
- ALL `--accent-primary`, `--accent-secondary`, `--accent-gradient`
- `--card-hover`, `--card-border` (use `accent` for hover, `border` for borders)
- `--border-secondary`, `--border-tertiary` (just use `border`)
- `--input-focus` (use `ring`)
- `--primary-hover`, `--secondary-hover`

---

## 2. Typography — What Changes

### Current (WRONG): Custom CSS utility classes + variables
```css
/* Custom utilities in tailwind.config.js plugin */
.text-display     { font-size: 28px; font-weight: 700; ... }
.text-heading-1   { font-size: 24px; font-weight: 600; ... }
.text-heading-2   { font-size: 20px; font-weight: 600; ... }
.text-heading-3   { font-size: 16px; font-weight: 500; ... }
.text-body-large  { font-size: 16px; ... }
.text-body        { font-size: 14px; ... }
.text-body-small  { font-size: 13px; ... }
.text-caption     { font-size: 12px; text-transform: uppercase; ... }
.text-label       { font-size: 10px; text-transform: uppercase; ... }
```

Plus custom CSS variables: `--font-size-xs` through `--font-size-4xl`

### Target (CORRECT): Standard Tailwind typography classes

| Usage | Tailwind Classes | Size |
|-------|-----------------|------|
| Page title | `text-2xl font-semibold tracking-tight` | 24px |
| Section heading | `text-lg font-semibold` | 18px |
| Card title | `text-base font-semibold` | 16px |
| Body text | `text-sm` | 14px |
| Secondary/muted text | `text-sm text-muted-foreground` | 14px |
| Small text | `text-xs text-muted-foreground` | 12px |
| Caption/label | `text-xs font-medium text-muted-foreground` | 12px |
| Monospace/code | `text-sm font-mono` | 14px |

**Font family:** Inter (keep current) — set via Tailwind `fontFamily.sans`

### What Gets DELETED
- ALL custom typography utilities from tailwind.config.js plugin (`.text-display`, `.text-heading-*`, `.text-body-*`, `.text-caption`, `.text-label`)
- ALL custom font-size CSS variables (`--font-size-xs` through `--font-size-4xl`)
- ALL custom line-height variables (`--line-height-tight` through `--line-height-loose`)
- ALL custom font-weight variables (`--font-weight-light` through `--font-weight-bold`)
- Custom fontSize entries in tailwind.config.js (`primary-foundation`, `secondary-foundation`, etc.)

---

## 3. Spacing — What Changes

### Current (WRONG): Custom CSS variables for spacing
```css
--space-0: 0;
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
/* ... through --space-24 */
```
Remapped in tailwind.config.js `spacing` to use these variables.

### Target (CORRECT): Standard Tailwind spacing scale
Remove ALL custom spacing variables. Use Tailwind's built-in scale directly:

| Tailwind | Value | Common Usage |
|----------|-------|-------------|
| `gap-1` / `p-1` | 4px | Tight spacing, icon gaps |
| `gap-1.5` / `p-1.5` | 6px | Badge padding, compact items |
| `gap-2` / `p-2` | 8px | Button padding, input padding |
| `gap-3` / `p-3` | 12px | Card content gaps |
| `gap-4` / `p-4` | 16px | Standard section spacing |
| `gap-6` / `p-6` | 24px | Card padding, dialog padding |
| `gap-8` / `p-8` | 32px | Page section spacing |

### What Gets DELETED
- ALL `--space-*` CSS variables
- ALL custom spacing entries in tailwind.config.js (the entire `spacing` override)

---

## 4. Border Radius — What Changes

### Current (WRONG): Custom CSS variables
```css
--radius-xs: 0.125rem;  /* 2px */
--radius-sm: 0.25rem;   /* 4px */
--radius-md: 0.375rem;  /* 6px */
--radius-lg: 0.5rem;    /* 8px */
--radius-xl: 0.75rem;   /* 12px */
--radius-2xl: 1rem;     /* 16px */
```

### Target (CORRECT): shadcn radius scale
```css
--radius: 0.5rem;  /* 10px base */
--radius-sm: calc(var(--radius) - 4px);    /* 4px */
--radius-md: calc(var(--radius) - 2px);    /* 6px */
--radius-lg: var(--radius);                /* 8px */
--radius-xl: calc(var(--radius) + 4px);    /* 12px */
--radius-2xl: calc(var(--radius) + 8px);   /* 16px */
```

### What Gets DELETED
- Custom `--radius-xs` (not in shadcn scale)
- Custom borderRadius entries in tailwind.config.js

---

## 5. Shadows — What Changes

### Current: Custom CSS variables
These are fine and close to Tailwind defaults. But we should use Tailwind's built-in shadow utilities directly instead of CSS variables:

### Target: Standard Tailwind shadows
| Usage | Class |
|-------|-------|
| Cards | `shadow-sm` or no shadow (dark mode cards usually don't need shadows) |
| Dropdowns/popovers | `shadow-md` |
| Dialogs | `shadow-lg` |
| Elevated content | `shadow-xl` |

### What Gets DELETED
- ALL `--shadow-*` CSS variables
- Shadow entries in tailwind.config.js

---

## 6. Transitions — What Changes

### Current: Custom CSS variables
```css
--transition-fast: 150ms cubic-bezier(0.23, 1, 0.32, 1);
--transition-base: 200ms cubic-bezier(0.23, 1, 0.32, 1);
```

### Target: Standard Tailwind transitions
Use `transition-colors`, `transition-all`, `duration-150`, `duration-200`.

### What Gets DELETED
- ALL `--transition-*` CSS variables
- Custom transitionDuration entries in tailwind.config.js
- Custom transitionTimingFunction entries

---

## 7. Component Sizing Reference (from Figma + shadcn defaults)

### Button Sizes
| Size | Height | Padding | Font | Radius |
|------|--------|---------|------|--------|
| `sm` | h-8 (32px) | px-3 | text-xs | rounded-md |
| `default` | h-9 (36px) | px-4 | text-sm | rounded-md |
| `lg` | h-10 (40px) | px-6 | text-sm | rounded-md |
| `icon` | size-9 (36px) | — | — | rounded-md |

### Card Padding
| Part | Padding |
|------|---------|
| CardHeader | `p-6` (24px) |
| CardContent | `p-6 pt-0` (24px sides/bottom, 0 top) |
| CardFooter | `p-6 pt-0` |
| Gap between header items | `gap-1.5` (6px) |

### Table Sizing
| Part | Sizing |
|------|--------|
| TableHead | `h-10 px-4 text-xs font-medium text-muted-foreground` |
| TableCell | `p-4 text-sm` |
| TableRow | `border-b transition-colors hover:bg-muted/50` |

### Input Sizing
| Variant | Sizing |
|---------|--------|
| Default | `h-9 px-3 text-sm rounded-md border border-input` |
| With icon | Use `InputGroup` + `InputGroupAddon` |

### Dialog Padding
| Part | Padding |
|------|---------|
| DialogContent | `p-6` |
| DialogHeader | `gap-2` |
| DialogFooter | `gap-2 flex justify-end` |

### Sidebar Dimensions
| Property | Value |
|----------|-------|
| Width (expanded) | 16rem (256px) |
| Width (icon mode) | 3rem (48px) |
| Width (mobile) | 18rem (288px) |
| Menu item height | h-8 (32px) |
| Menu item padding | `px-2` |
| Section gap | `gap-2` |
| Icon size | `size-4` (16px) |

### Badge Sizing
| Variant | Sizing |
|---------|--------|
| Default | `px-2.5 py-0.5 text-xs font-semibold rounded-full` |
| Outline | Same + `border` |

### Tooltip
| Property | Value |
|----------|-------|
| Padding | `px-3 py-1.5` |
| Font | `text-xs` |
| Radius | `rounded-md` |

---

## 8. Tailwind Config Changes

### DELETE from tailwind.config.js
1. **Entire `spacing` override** — use Tailwind defaults
2. **Entire `fontSize` override** — use Tailwind defaults
3. **Entire `fontWeight` override** — use Tailwind defaults
4. **Entire `lineHeight` override** — use Tailwind defaults
5. **Entire `borderRadius` override** — use shadcn's `--radius` calc scale
6. **Entire `boxShadow` override** — use Tailwind defaults
7. **Entire `transitionDuration` override** — use Tailwind defaults
8. **Entire `transitionTimingFunction` override** — use Tailwind defaults
9. **Entire custom plugin** (typography utilities, interactive utilities, card utilities, status utilities, gradient utilities, glass utilities, scrollbar utilities, select utilities)
10. **Custom color tokens** that duplicate shadcn (bg-primary, text-primary, nav-*, etc.)

### KEEP in tailwind.config.js
1. `darkMode: ["class"]`
2. `content` paths
3. `fontFamily.sans` (Inter) and `fontFamily.mono`
4. `plugins: [require("tailwindcss-animate")]`
5. Status color tokens (`status-success`, `status-warning`, `status-error`, `status-info`) — added to shadcn's color scheme
6. Chart color tokens (already standard shadcn)

### Result: Minimal tailwind.config.js
```js
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'monospace'],
      },
      colors: {
        // Status colors (domain-specific, not in shadcn)
        'status-success': 'var(--status-success)',
        'status-warning': 'var(--status-warning)',
        'status-error': 'var(--status-error)',
        'status-info': 'var(--status-info)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

---

## 9. CSS File Changes

### DELETE files
- `src/styles/foundation.css` (entire custom foundation system)
- Any other custom style files that define non-shadcn tokens

### REWRITE `src/index.css`
Replace entirely with standard shadcn theme variables (OKLCH) + our status color additions. Remove all custom utilities, all custom typography classes, all custom interactive states.

---

## 10. Migration Impact on Components

Every component that uses custom tokens needs updating:

| Custom Token | Replace With |
|---|---|
| `bg-bg-primary` | `bg-background` |
| `bg-bg-secondary` | `bg-muted` |
| `bg-bg-tertiary` | `bg-muted` |
| `bg-bg-elevated` | `bg-card` |
| `text-text-primary` | `text-foreground` |
| `text-text-secondary` | `text-muted-foreground` |
| `text-text-tertiary` | `text-muted-foreground` |
| `border-border-primary` | `border-border` |
| `border-border-secondary` | `border-border` |
| `bg-nav-background` | `bg-sidebar` |
| `text-nav-text-primary` | `text-sidebar-foreground` |
| `bg-nav-active-bg` | `bg-sidebar-accent` |
| `bg-card-hover` | `hover:bg-accent` |
| `text-heading-1` | `text-2xl font-semibold tracking-tight` |
| `text-heading-2` | `text-xl font-semibold` |
| `text-heading-3` | `text-base font-semibold` |
| `text-body` | `text-sm` |
| `text-body-small` | `text-sm text-muted-foreground` |
| `text-caption` | `text-xs font-medium text-muted-foreground uppercase tracking-wider` |
| `interactive-hover` | `transition-colors hover:bg-accent` |
| `card-elevated` | Use `Card` component |
| `focus-ring` | Built into shadcn components |
| `glass` | Remove (not used in new design) |

Estimated files affected: **80-100 files** (every component using custom tokens)

---

## Summary: What's Happening

| Area | Current | After |
|------|---------|-------|
| Color tokens | ~50 custom variables | 30 standard shadcn OKLCH + 4 status |
| Typography | 10 custom utility classes + 8 CSS vars | Standard Tailwind classes |
| Spacing | 14 custom CSS variables | Standard Tailwind scale |
| Radius | 6 custom values | shadcn calc-based scale |
| Shadows | 6 custom variables | Standard Tailwind |
| Transitions | 4 custom variables | Standard Tailwind |
| tailwind.config.js | ~300 lines | ~20 lines |
| index.css | ~200 lines of custom CSS | ~80 lines of shadcn tokens |
| Custom plugin | ~200 lines | Deleted |
| foundation.css | ~100 lines | Deleted |
