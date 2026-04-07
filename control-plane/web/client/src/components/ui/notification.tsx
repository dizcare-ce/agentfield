import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Card, CardContent } from "./card";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

export type NotificationType = "success" | "error" | "warning" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  /** Toast auto-dismiss duration in ms. Set to 0 to keep the toast until clicked. */
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** If true, the toast will not auto-dismiss. Log entry is always persistent regardless. */
  persistent?: boolean;
  /** ms epoch, set automatically on creation. */
  createdAt: number;
  /** Whether the user has seen / acknowledged this in the bell popover. */
  read: boolean;
}

interface NotificationContextType {
  /** All notifications, newest first. Acts as the persistent log. */
  notifications: Notification[];
  /** Subset currently visible as toasts (transient). */
  toasts: Notification[];
  /** Count of unread notifications across the log. */
  unreadCount: number;
  addNotification: (
    notification: Omit<Notification, "id" | "createdAt" | "read">,
  ) => string;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Removes from both log and toast queue. */
  removeNotification: (id: string) => void;
  /** Dismiss a single toast without removing it from the log. */
  dismissToast: (id: string) => void;
  /** Clear the entire log. Also dismisses any active toasts. */
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined,
);

/** Keep the log bounded — older entries roll off the end. */
const MAX_LOG_SIZE = 50;

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider",
    );
  }
  return context;
}

/* ═══════════════════════════════════════════════════════════════
   Provider
   ═══════════════════════════════════════════════════════════════ */

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toastIds, setToastIds] = useState<Set<string>>(() => new Set());

  const dismissToast = useCallback((id: string) => {
    setToastIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const removeNotification = useCallback(
    (id: string) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      dismissToast(id);
    },
    [dismissToast],
  );

  const addNotification: NotificationContextType["addNotification"] =
    useCallback(
      (notification) => {
        const id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2, 11);

        const entry: Notification = {
          ...notification,
          id,
          createdAt: Date.now(),
          read: false,
          duration: notification.duration ?? 5000,
        };

        setNotifications((prev) => [entry, ...prev].slice(0, MAX_LOG_SIZE));
        setToastIds((prev) => {
          const next = new Set(prev);
          next.add(id);
          return next;
        });

        if (!entry.persistent && entry.duration && entry.duration > 0) {
          window.setTimeout(() => {
            dismissToast(id);
          }, entry.duration);
        }

        return id;
      },
      [dismissToast],
    );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.every((n) => n.read) ? prev : prev.map((n) => ({ ...n, read: true })),
    );
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setToastIds(new Set());
  }, []);

  const toasts = useMemo(
    () => notifications.filter((n) => toastIds.has(n.id)),
    [notifications, toastIds],
  );

  const unreadCount = useMemo(
    () => notifications.reduce((count, n) => count + (n.read ? 0 : 1), 0),
    [notifications],
  );

  const contextValue = useMemo<NotificationContextType>(
    () => ({
      notifications,
      toasts,
      unreadCount,
      addNotification,
      markRead,
      markAllRead,
      removeNotification,
      dismissToast,
      clearAll,
    }),
    [
      notifications,
      toasts,
      unreadCount,
      addNotification,
      markRead,
      markAllRead,
      removeNotification,
      dismissToast,
      clearAll,
    ],
  );

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      <NotificationToastContainer />
    </NotificationContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Icon + accent helpers — single source of truth
   ═══════════════════════════════════════════════════════════════ */

const TYPE_ICON: Record<NotificationType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

/**
 * Accent classes per notification type — uses existing Tailwind/shadcn tokens
 * consistent with CompactExecutionHeader and other app chrome.
 */
const TYPE_ACCENT: Record<NotificationType, { icon: string; border: string }> = {
  success: {
    icon: "text-emerald-500 dark:text-emerald-400",
    border: "border-l-emerald-500/60",
  },
  error: {
    icon: "text-destructive",
    border: "border-l-destructive/70",
  },
  warning: {
    icon: "text-amber-500 dark:text-amber-400",
    border: "border-l-amber-500/60",
  },
  info: {
    icon: "text-sky-500 dark:text-sky-400",
    border: "border-l-sky-500/60",
  },
};

export function getNotificationIcon(type: NotificationType) {
  return TYPE_ICON[type];
}

export function getNotificationAccent(type: NotificationType) {
  return TYPE_ACCENT[type];
}

/* ═══════════════════════════════════════════════════════════════
   Toast container — transient, bottom-right
   ═══════════════════════════════════════════════════════════════ */

function NotificationToastContainer() {
  const { toasts, dismissToast } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <NotificationToastItem
          key={toast.id}
          notification={toast}
          onClose={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}

interface NotificationToastItemProps {
  notification: Notification;
  onClose: () => void;
}

function NotificationToastItem({
  notification,
  onClose,
}: NotificationToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsVisible(true), 10);
    return () => window.clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    window.setTimeout(onClose, 200);
  };

  const accent = getNotificationAccent(notification.type);
  const Icon = getNotificationIcon(notification.type);

  return (
    <Card
      role="status"
      className={cn(
        "pointer-events-auto border-l-4 bg-card shadow-lg transition-all duration-200",
        accent.border,
        isVisible
          ? "translate-x-0 opacity-100"
          : "pointer-events-none translate-x-4 opacity-0",
      )}
    >
      <CardContent className="flex items-start gap-3 p-3">
        <Icon
          className={cn("mt-0.5 size-4 shrink-0", accent.icon)}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-tight text-foreground">
              {notification.title}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-1 size-5 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleClose}
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
          {notification.message ? (
            <p className="text-xs leading-snug text-muted-foreground">
              {notification.message}
            </p>
          ) : null}
          {notification.action ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-1.5 h-7 w-fit text-xs"
              onClick={() => {
                notification.action?.onClick();
                handleClose();
              }}
            >
              {notification.action.label}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Convenience hooks — backwards-compatible with existing callers
   ═══════════════════════════════════════════════════════════════ */

export function useSuccessNotification() {
  const { addNotification } = useNotifications();
  return useCallback(
    (title: string, message?: string, action?: Notification["action"]) =>
      addNotification({
        type: "success",
        title,
        message,
        action,
        duration: 4000,
      }),
    [addNotification],
  );
}

export function useErrorNotification() {
  const { addNotification } = useNotifications();
  return useCallback(
    (title: string, message?: string, action?: Notification["action"]) =>
      addNotification({
        type: "error",
        title,
        message,
        action,
        duration: 6000,
      }),
    [addNotification],
  );
}

export function useInfoNotification() {
  const { addNotification } = useNotifications();
  return useCallback(
    (title: string, message?: string, action?: Notification["action"]) =>
      addNotification({
        type: "info",
        title,
        message,
        action,
        duration: 5000,
      }),
    [addNotification],
  );
}

export function useWarningNotification() {
  const { addNotification } = useNotifications();
  return useCallback(
    (title: string, message?: string, action?: Notification["action"]) =>
      addNotification({
        type: "warning",
        title,
        message,
        action,
        duration: 5000,
      }),
    [addNotification],
  );
}

/* ═══════════════════════════════════════════════════════════════
   DID/VC specific helpers — unchanged public API
   ═══════════════════════════════════════════════════════════════ */

export function useDIDNotifications() {
  const success = useSuccessNotification();
  const error = useErrorNotification();
  const info = useInfoNotification();

  return {
    didCopied: (type: string = "DID") =>
      success(`${type} Copied`, `${type} has been copied to clipboard`),

    didRegistered: (nodeId: string) =>
      success("DID Registered", `DID identity registered for node ${nodeId}`),

    didError: (message: string) => error("DID Operation Failed", message),

    didRefreshed: () =>
      info("DID Data Refreshed", "DID information has been updated"),
  };
}

export function useVCNotifications() {
  const success = useSuccessNotification();
  const error = useErrorNotification();
  const info = useInfoNotification();

  return {
    vcCopied: () =>
      success("VC Copied", "Verifiable Credential copied to clipboard"),

    vcDownloaded: (filename?: string) =>
      success(
        "VC Downloaded",
        filename ? `Downloaded as ${filename}` : "VC document downloaded",
      ),

    vcVerified: (valid: boolean) =>
      valid
        ? success("VC Verified", "Verifiable Credential is valid and verified")
        : error(
            "VC Verification Failed",
            "Verifiable Credential verification failed",
          ),

    vcError: (message: string) => error("VC Operation Failed", message),

    vcChainLoaded: (count: number) =>
      info("VC Chain Loaded", `Loaded ${count} verification credentials`),
  };
}
