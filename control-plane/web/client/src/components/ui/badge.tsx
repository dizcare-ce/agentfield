import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"
import { getStatusBadgeClasses, statusTone, type StatusTone } from "../../lib/theme"
import { getStatusTheme } from "../../utils/status"
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  HelpCircle,
  type LucideIcon,
} from "lucide-react"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-0.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-muted text-foreground border border-border hover:bg-muted shadow-sm",
        secondary:
          "bg-muted text-muted-foreground border border-border/50 hover:bg-muted shadow-sm",
        destructive:
          cn(
            statusTone.error.bg,
            statusTone.error.fg,
            statusTone.error.border,
            "shadow-sm"
          ),
        outline:
          "text-foreground border border-border bg-transparent hover:bg-accent shadow-sm",
        metadata:
          "rounded-md bg-muted/40 text-muted-foreground border border-border/60 px-1.5 py-0.5 text-micro font-medium font-mono",
        count:
          "rounded-full bg-muted text-foreground border border-border px-2 py-0.5 text-micro font-semibold uppercase tracking-wide",
        pill:
          "rounded-full bg-muted/30 text-foreground border border-border/40 px-2.5 py-0.5 text-micro-plus",

        // Tooltip variant – -style chip optimized for dark tooltip backgrounds
        tooltip:
          "bg-white/15 text-primary-foreground border border-white/20 rounded-md",

        // Status variants with standardized colors and icons
        success:
          cn(getStatusBadgeClasses("success" satisfies StatusTone), "font-mono tracking-tight"),
        failed:
          cn(getStatusBadgeClasses("error" satisfies StatusTone), "font-mono tracking-tight"),
        running:
          cn(getStatusBadgeClasses("info" satisfies StatusTone), "font-mono tracking-tight"),
        pending:
          cn(getStatusBadgeClasses("warning" satisfies StatusTone), "font-mono tracking-tight"),

        // Additional status variants for degraded states
        degraded:
          cn(getStatusBadgeClasses("warning" satisfies StatusTone), "font-mono tracking-tight"),
        unknown:
          cn(getStatusBadgeClasses("neutral" satisfies StatusTone), "font-mono tracking-tight"),
      },
      size: {
        sm: "px-1.5 py-0 text-micro",
        md: "px-2 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode;
  showIcon?: boolean;
}

const statusIcons: Partial<Record<BadgeVariant, { icon: LucideIcon }>> = {
  success: { icon: CheckCircle2 },
  failed: { icon: XCircle },
  running: { icon: Loader2 },
  pending: { icon: Clock },
  degraded: { icon: AlertTriangle },
  unknown: { icon: HelpCircle },
  destructive: { icon: XCircle },
};

function Badge({ className, variant, size, icon, showIcon = true, children, ...props }: BadgeProps) {
  const toneByVariant: Partial<Record<BadgeVariant, StatusTone>> = {
    success: "success",
    failed: "error",
    running: "info",
    pending: "warning",
    degraded: "warning",
    unknown: "neutral",
    destructive: "error",
  };

  const shouldShowIcon = showIcon && variant && variant in statusIcons;
  const statusIconEntry = shouldShowIcon ? statusIcons[variant] : null;
  const StatusIconComponent = statusIconEntry?.icon;
  const iconTone = variant ? toneByVariant[variant] : undefined;
  // Derive motion behaviour from StatusTheme so the single source of truth
  // in utils/status.ts governs whether the icon spins. Only status variants
  // that map to a canonical status with motion === "live" will spin; non-status
  // variants (default, secondary, outline, etc.) resolve to "unknown" → "none".
  const variantToCanonical: Partial<Record<BadgeVariant, string>> = {
    success: "succeeded",
    failed: "failed",
    running: "running",
    pending: "pending",
    degraded: "paused",
    unknown: "unknown",
    destructive: "failed",
  };
  const canonicalForVariant = variant ? variantToCanonical[variant] : undefined;
  const shouldSpinIcon = canonicalForVariant
    ? getStatusTheme(canonicalForVariant).motion === "live"
    : false;

  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {icon || (StatusIconComponent && (
        <StatusIconComponent
          size={12}
          className={cn(
            "flex-shrink-0",
            iconTone ? statusTone[iconTone].accent : undefined,
            shouldSpinIcon && "motion-safe:animate-spin"
          )}
          style={
            shouldSpinIcon ? { animationDuration: "2.5s" } : undefined
          }
        />
      ))}
      {children}
    </div>
  )
}

// Convenience status badge components
function StatusBadge({
  status,
  children,
  className,
  ...props
}: Omit<BadgeProps, 'variant'> & {
  status: 'success' | 'failed' | 'running' | 'pending' | 'degraded' | 'unknown'
}) {
  return (
    <Badge variant={status} className={className} {...props}>
      {children || status.toUpperCase()}
    </Badge>
  );
}

export { Badge, StatusBadge, badgeVariants }
