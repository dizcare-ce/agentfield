# shadcn/ui Component Sizing Reference

Extracted from the Figma file (shadcn/ui components with Tailwind classes, Jan 2026).
These are the exact values to follow for all components.

## Typography Scale

| Tailwind Class | Size | Weight | Line Height |
|---|---|---|---|
| `text-xs` | 12px | 400 | 16px |
| `text-xs font-medium` | 12px | 500 | 16px |
| `text-sm` | 14px | 400 | 20px |
| `text-sm font-medium` | 14px | 500 | 20px |
| `text-base` | 16px | 400 | 24px |
| `text-lg font-semibold` | 18px | 600 | 28px |
| `text-xl font-semibold` | 20px | 600 | 28px |
| `text-2xl font-semibold tracking-tight` | 24px | 600 | 32px |

## Component Sizing

### Button
| Size | Height | Padding | Font | Radius |
|------|--------|---------|------|--------|
| `xs` | h-6 (24px) | px-2 | text-xs | rounded-sm |
| `sm` | h-8 (32px) | px-3 py-1.5 | text-xs font-medium | rounded-md |
| `default` | h-9 (36px) | px-4 py-2 | text-sm font-medium | rounded-md |
| `lg` | h-10 (40px) | px-6 py-2 | text-sm font-medium | rounded-md |
| `icon` | size-9 (36px) | — | — | rounded-md |

### Card
| Part | Spacing |
|------|---------|
| Card container | rounded-lg border bg-card shadow-sm |
| CardHeader | p-6, gap-1.5 between title and description |
| CardContent | p-6 pt-0 |
| CardFooter | p-6 pt-0, flex items-center |
| CardTitle | text-base font-semibold leading-none tracking-tight |
| CardDescription | text-sm text-muted-foreground |

### Table
| Part | Sizing |
|------|--------|
| Table container | w-full text-sm |
| TableHead (th) | h-10 px-4 text-xs font-medium text-muted-foreground text-left |
| TableCell (td) | p-4 align-middle |
| TableRow | border-b transition-colors hover:bg-muted/50 |
| TableFooter | bg-muted/50 font-medium |

### Input / Select
| Property | Value |
|----------|-------|
| Height | h-9 (36px) |
| Padding | px-3 py-2 |
| Font | text-sm |
| Border | border border-input rounded-md |
| Focus | ring-ring/50 ring-offset-2 |
| Placeholder | text-muted-foreground |

### Sidebar
| Property | Value |
|----------|-------|
| Width (expanded) | 16rem (256px) — `--sidebar-width` |
| Width (icon/collapsed) | 3rem (48px) — `--sidebar-width-icon` |
| Width (mobile) | 18rem (288px) — `--sidebar-width-mobile` |
| Menu item height | 28px (h-7) |
| Menu item padding | px-2 py-1.5 |
| Menu item icon | size-4 (16px) |
| Menu item font | text-xs font-medium (12px/500) |
| Section gap | gap-2 |
| Section label | text-xs font-medium text-muted-foreground uppercase tracking-wider |
| Keyboard shortcut | Cmd+B |

### Badge
| Property | Value |
|----------|-------|
| Padding | px-2.5 py-0.5 |
| Font | text-xs font-semibold |
| Radius | rounded-full (9999px) |
| Border | border (for outline variant) |

### Dialog
| Property | Value |
|----------|-------|
| Content padding | p-6 |
| Header gap | gap-2 |
| Title | text-lg font-semibold |
| Description | text-sm text-muted-foreground |
| Footer | gap-2, flex justify-end |

### Sheet (Side Panel)
| Property | Value |
|----------|-------|
| Padding | p-6 |
| Same structure as Dialog |

### Tooltip
| Property | Value |
|----------|-------|
| Padding | px-3 py-1.5 |
| Font | text-xs |
| Radius | rounded-md |
| Background | bg-primary text-primary-foreground |

### Dropdown Menu Item
| Property | Value |
|----------|-------|
| Height | 28px |
| Padding | px-2 py-1.5 |
| Font | text-xs font-medium (12px/500) |
| Icon slot | size-4 (16px), mr-1 |
| Container padding | p-1 (4px all sides) |

### Alert
| Property | Value |
|----------|-------|
| Padding | p-4 |
| Title | text-sm font-medium |
| Description | text-sm text-muted-foreground |
| Icon | size-4, top-4 left-4 |

### Separator
| Property | Value |
|----------|-------|
| Horizontal | h-px w-full bg-border |
| Vertical | w-px h-full bg-border |

### ScrollArea
| Property | Value |
|----------|-------|
| Scrollbar width | w-2.5 (10px) |
| Scrollbar thumb | rounded-full bg-border |

## Spacing Patterns

### Page Layout
| Element | Spacing |
|---------|---------|
| Page padding | p-6 (24px) |
| Section gap | gap-6 (24px) |
| Card grid gap | gap-4 (16px) |

### Within Cards
| Element | Spacing |
|---------|---------|
| Header → Content | 0 (pt-0 on content) |
| Between form fields | gap-4 (16px) |
| Label → Input | gap-2 (8px) |
| Stacked items | gap-2 (8px) |

### Navigation
| Element | Spacing |
|---------|---------|
| Nav sections | gap-4 (16px) |
| Nav items | gap-1 (4px) |
| Section label → items | gap-2 (8px) |

## Color Usage Patterns

| Purpose | Token |
|---------|-------|
| Page background | `bg-background` |
| Cards, panels | `bg-card` |
| Hover state on rows/items | `hover:bg-muted/50` or `hover:bg-accent` |
| Primary text | `text-foreground` |
| Secondary/description text | `text-muted-foreground` |
| Placeholder text | `text-muted-foreground` |
| Borders | `border-border` |
| Status: success | `text-status-success` / `bg-status-success/10` |
| Status: error | `text-destructive` / `bg-destructive/10` |
| Status: warning | `text-status-warning` / `bg-status-warning/10` |
| Status: running | `text-status-info` / `bg-status-info/10` |
| Focus ring | `ring-ring/50 ring-offset-2` |
