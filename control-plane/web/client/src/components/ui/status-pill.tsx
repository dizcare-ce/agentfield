import { cn } from "@/lib/utils";
import {
  getStatusLabel,
  getStatusTheme,
  normalizeExecutionStatus,
} from "@/utils/status";

/* ═══════════════════════════════════════════════════════════════
   Unified status primitives

   Single source of truth for how a run / execution status is
   visualised anywhere in the app. Consume <StatusDot /> or
   <StatusPill /> instead of reinventing dot/badge markup.

   Colors, icons, and motion all come from utils/status.ts via
   getStatusTheme() so there is no hardcoded mapping here.
   ═══════════════════════════════════════════════════════════════ */

type StatusSize = "sm" | "md" | "lg";

const DOT_SIZE: Record<StatusSize, string> = {
  sm: "size-1.5",
  md: "size-2",
  lg: "size-2.5",
};

const ICON_SIZE: Record<StatusSize, string> = {
  sm: "size-3",
  md: "size-3.5",
  lg: "size-4",
};

const TEXT_SIZE: Record<StatusSize, string> = {
  sm: "text-[11px]",
  md: "text-xs",
  lg: "text-sm",
};

/* ───────────────────────────── StatusDot ─────────────────────── */

interface StatusDotProps {
  status: string;
  size?: StatusSize;
  label?: boolean;
  className?: string;
}

/**
 * Tiny coloured dot + optional label. When the status has motion === "live"
 * the dot renders a soft pinging halo underneath the solid core so users
 * can tell something is actively happening. Everywhere else the dot is
 * static. No hardcoded colors — everything routes through getStatusTheme().
 */
export function StatusDot({
  status,
  size = "sm",
  label = true,
  className,
}: StatusDotProps) {
  const normalized = normalizeExecutionStatus(status);
  const theme = getStatusTheme(normalized);
  const sizeClass = DOT_SIZE[size];
  const isLive = theme.motion === "live";

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      data-status={normalized}
      role={label ? undefined : "img"}
      aria-label={label ? undefined : getStatusLabel(normalized)}
    >
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center",
          sizeClass,
        )}
      >
        {isLive ? (
          <span
            aria-hidden
            className={cn(
              "absolute inline-flex size-full rounded-full opacity-60",
              theme.indicatorClass,
              "motion-safe:animate-ping",
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            sizeClass,
            theme.indicatorClass,
          )}
        />
      </span>
      {label ? (
        <span className={cn("leading-none", TEXT_SIZE[size], "text-foreground/90")}>
          {getStatusLabel(normalized).toLowerCase()}
        </span>
      ) : null}
    </span>
  );
}

/* ───────────────────────────── StatusIcon ────────────────────── */

interface StatusIconProps {
  status: string;
  size?: StatusSize;
  className?: string;
}

/**
 * Just the status glyph with proper colour + motion. Useful inside buttons,
 * table cells, or wherever you want the icon but no container/background.
 * Running statuses spin slowly (2.5s) so the motion reads as "live" without
 * being distracting when many rows are active.
 */
export function StatusIcon({
  status,
  size = "sm",
  className,
}: StatusIconProps) {
  const normalized = normalizeExecutionStatus(status);
  const theme = getStatusTheme(normalized);
  const Icon = theme.icon;
  const isLive = theme.motion === "live";

  return (
    <Icon
      aria-hidden
      data-status={normalized}
      className={cn(
        ICON_SIZE[size],
        theme.iconClass,
        isLive && "motion-safe:animate-spin",
        className,
      )}
      style={isLive ? { animationDuration: "2.5s" } : undefined}
    />
  );
}

/* ───────────────────────────── StatusPill ────────────────────── */

interface StatusPillProps {
  status: string;
  size?: StatusSize;
  className?: string;
  showLabel?: boolean;
  showIcon?: boolean;
}

const PILL_PADDING: Record<StatusSize, string> = {
  sm: "px-2 py-0.5",
  md: "px-2.5 py-1",
  lg: "px-3 py-1.5",
};

/**
 * Rounded chip with icon + label. Prefer this over inline Badge usage for
 * anything displaying a canonical status — it guarantees colour, icon,
 * motion, and label are all in sync with the theme.
 */
export function StatusPill({
  status,
  size = "md",
  className,
  showLabel = true,
  showIcon = true,
}: StatusPillProps) {
  const normalized = normalizeExecutionStatus(status);
  const theme = getStatusTheme(normalized);

  return (
    <span
      data-status={normalized}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        PILL_PADDING[size],
        TEXT_SIZE[size],
        theme.bgClass,
        theme.borderClass,
        theme.textClass,
        className,
      )}
    >
      {showIcon ? <StatusIcon status={normalized} size={size} /> : null}
      {showLabel ? (
        <span className="capitalize leading-none">
          {getStatusLabel(normalized)}
        </span>
      ) : null}
    </span>
  );
}
