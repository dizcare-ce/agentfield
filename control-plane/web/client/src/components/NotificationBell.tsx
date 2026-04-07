import { useEffect, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  getNotificationAccent,
  getNotificationIcon,
  useNotifications,
  type Notification,
} from "@/components/ui/notification";

/**
 * Notification bell + popover center.
 *
 * Lives in the sidebar header next to ModeToggle. Always visible, muted at
 * rest, with an unread count badge rendered via the shadcn <Badge>. Clicking
 * opens a Popover with the full persistent notification log.
 */
interface NotificationBellProps {
  className?: string;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function formatRelativeTime(createdAt: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - createdAt) / 1000));
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return rtf.format(-diffSec, "second");
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return rtf.format(-diffHr, "hour");
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return rtf.format(-diffDay, "day");
  const diffWk = Math.floor(diffDay / 7);
  return rtf.format(-diffWk, "week");
}

export function NotificationBell({ className }: NotificationBellProps) {
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  // Re-render relative timestamps periodically while popover is open.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  const hasNotifications = notifications.length > 0;
  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative size-10 shrink-0 rounded-md text-sidebar-foreground",
            "hover:bg-[var(--sidebar-hover)] hover:text-sidebar-accent-foreground",
            "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            "group-data-[collapsible=icon]:size-8",
            className,
          )}
          aria-label={
            hasUnread
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Bell
            className={cn(
              "size-4 transition-colors",
              !hasUnread && "text-sidebar-foreground/70",
            )}
            aria-hidden
          />
          {hasUnread ? (
            <Badge
              variant="destructive"
              className={cn(
                "pointer-events-none absolute -right-0.5 -top-0.5",
                "flex h-4 min-w-[1rem] items-center justify-center",
                "rounded-full px-1 text-[10px] font-semibold leading-none tabular-nums",
                "shadow-sm ring-2 ring-sidebar",
              )}
              aria-hidden
            >
              {badgeLabel}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="right"
        sideOffset={12}
        className="w-[min(92vw,22rem)] p-0"
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-sm font-semibold leading-none text-foreground">
              Notifications
            </h3>
            {hasUnread ? (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] font-medium leading-none"
              >
                {unreadCount} new
              </Badge>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
            onClick={markAllRead}
            disabled={!hasUnread}
            aria-label="Mark all as read"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            Mark all read
          </Button>
        </div>
        <Separator />
        {hasNotifications ? (
          <>
            <ScrollArea className="max-h-[22rem]">
              <ul className="flex flex-col">
                {notifications.map((notification, index) => (
                  <li key={notification.id}>
                    <NotificationRow
                      notification={notification}
                      now={now}
                      onMarkRead={() => markRead(notification.id)}
                      onRemove={() => removeNotification(notification.id)}
                    />
                    {index < notifications.length - 1 ? (
                      <Separator className="opacity-60" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </ScrollArea>
            <Separator />
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-micro text-muted-foreground">
                {notifications.length}{" "}
                {notifications.length === 1 ? "notification" : "notifications"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={clearAll}
                aria-label="Clear all notifications"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Clear all
              </Button>
            </div>
          </>
        ) : (
          <NotificationEmptyState />
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Row + empty state
   ═══════════════════════════════════════════════════════════════ */

interface NotificationRowProps {
  notification: Notification;
  now: number;
  onMarkRead: () => void;
  onRemove: () => void;
}

function NotificationRow({
  notification,
  now,
  onMarkRead,
  onRemove,
}: NotificationRowProps) {
  const Icon = getNotificationIcon(notification.type);
  const accent = getNotificationAccent(notification.type);
  const relative = formatRelativeTime(notification.createdAt, now);

  return (
    <button
      type="button"
      onClick={() => {
        if (!notification.read) onMarkRead();
      }}
      className={cn(
        "group flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
        !notification.read && "bg-accent/25",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center",
          accent.icon,
        )}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <p
            className={cn(
              "truncate text-xs",
              notification.read
                ? "font-medium text-foreground/90"
                : "font-semibold text-foreground",
            )}
          >
            {notification.title}
          </p>
          {!notification.read ? (
            <span
              className="size-1.5 shrink-0 rounded-full bg-sky-500"
              aria-label="Unread"
            />
          ) : null}
        </div>
        {notification.message ? (
          <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {notification.message}
          </p>
        ) : null}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80 tabular-nums">
            {relative}
          </span>
          <span
            role="button"
            tabIndex={0}
            className={cn(
              "text-[10px] text-muted-foreground opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-visible:opacity-100",
              "hover:text-destructive",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onRemove();
              }
            }}
          >
            Dismiss
          </span>
        </div>
      </div>
    </button>
  );
}

function NotificationEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
      <Bell className="size-6 text-muted-foreground/40" aria-hidden />
      <p className="text-xs font-medium text-muted-foreground">
        No notifications yet
      </p>
      <p className="text-[11px] text-muted-foreground/70">
        You&rsquo;ll see run events, errors, and actions here.
      </p>
    </div>
  );
}
