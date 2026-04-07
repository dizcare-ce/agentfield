import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";

import { DEMO_STORAGE_KEYS, STORYLINE_BEATS } from "./constants";
import type { DemoActions, DemoState } from "./mock/types";

interface DemoModeContextType {
  state: DemoState;
  actions: DemoActions;
}

const DemoModeContext = createContext<DemoModeContextType | undefined>(
  undefined,
);

interface DemoModeProviderProps {
  children: ReactNode;
}

function getInitialDemoActive(): boolean {
  // 1. Check URL param
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "true") return true;

  // 2. Check localStorage
  const stored = localStorage.getItem(DEMO_STORAGE_KEYS.ACTIVE);
  if (stored === "true") return true;

  // 3. Check env var
  if (import.meta.env.VITE_DEMO_MODE === "true") return true;

  // 4. If user previously dismissed auto-activation, don't auto-activate
  const autoDismissed = localStorage.getItem(DEMO_STORAGE_KEYS.AUTO_DISMISSED);
  if (autoDismissed === "true") return false;

  return false;
}

function getInitialState(): DemoState {
  const active = getInitialDemoActive();

  const vertical =
    (localStorage.getItem(DEMO_STORAGE_KEYS.VERTICAL) as DemoState["vertical"]) ??
    null;

  const act = Number(localStorage.getItem(DEMO_STORAGE_KEYS.ACT) ?? "1") as DemoState['act'];

  const storyBeat = Number(
    localStorage.getItem(DEMO_STORAGE_KEYS.STORY_BEAT) ?? "0",
  );

  const visitedRaw = localStorage.getItem(DEMO_STORAGE_KEYS.VISITED_PAGES);
  const visitedPages = visitedRaw
    ? new Set<string>(JSON.parse(visitedRaw) as string[])
    : new Set<string>();

  // Deterministic in-progress run ID: derived from the epoch day so it is
  // stable across re-renders within the same day but changes between days.
  const dayStamp = Math.floor(Date.now() / 86_400_000);
  const inProgressRunId = `demo-run-${dayStamp}`;

  return {
    active,
    vertical,
    act,
    storyBeat,
    visitedPages,
    inProgressRunId,
  };
}

export function DemoModeProvider({ children }: DemoModeProviderProps) {
  const [state, setState] = useState<DemoState>(getInitialState);
  const location = useLocation();

  // Keep a stable ref for the inProgressRunId so it never changes after mount.
  const inProgressRunIdRef = useRef(state.inProgressRunId);

  // Persist relevant state slices to localStorage whenever they change.
  useEffect(() => {
    localStorage.setItem(
      DEMO_STORAGE_KEYS.ACTIVE,
      String(state.active),
    );
  }, [state.active]);

  useEffect(() => {
    if (state.vertical !== null) {
      localStorage.setItem(DEMO_STORAGE_KEYS.VERTICAL, state.vertical);
    }
  }, [state.vertical]);

  useEffect(() => {
    localStorage.setItem(DEMO_STORAGE_KEYS.ACT, String(state.act));
  }, [state.act]);

  useEffect(() => {
    localStorage.setItem(
      DEMO_STORAGE_KEYS.STORY_BEAT,
      String(state.storyBeat),
    );
  }, [state.storyBeat]);

  useEffect(() => {
    localStorage.setItem(
      DEMO_STORAGE_KEYS.VISITED_PAGES,
      JSON.stringify([...state.visitedPages]),
    );
  }, [state.visitedPages]);

  // Auto-advance storyline when user navigates to the current beat's target route.
  useEffect(() => {
    if (!state.active || state.act !== 1) return;
    const beat = STORYLINE_BEATS[state.storyBeat];
    if (!beat || !beat.targetRoute) return;

    // Resolve the target route (strip placeholders for prefix matching)
    const baseTarget = beat.targetRoute.replace(/\{[^}]+\}/g, '');
    if (!baseTarget) return;

    const currentPath = location.pathname;
    const matches = currentPath.startsWith(baseTarget) || baseTarget.startsWith(currentPath);

    if (matches) {
      const timer = setTimeout(() => {
        setState((prev) => {
          const nextBeat = prev.storyBeat + 1;
          const isLastBeat = nextBeat >= STORYLINE_BEATS.length;
          return {
            ...prev,
            storyBeat: isLastBeat ? prev.storyBeat : nextBeat,
            act: isLastBeat ? 2 : prev.act,
          };
        });
      }, 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [location.pathname, state.active, state.act, state.storyBeat]);

  // First-run auto-detection: if no agents are registered, auto-activate demo.
  useEffect(() => {
    const autoDismissed = localStorage.getItem(DEMO_STORAGE_KEYS.AUTO_DISMISSED);
    if (autoDismissed === "true") return;
    if (state.active) return;

    const controller = new AbortController();
    const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api/ui/v1";

    fetch(`${API_BASE}/nodes`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          // Server error — likely no backend; activate demo
          setState((prev) => ({ ...prev, active: true }));
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const nodes = Array.isArray(data) ? data : data?.nodes ?? [];
        if (nodes.length === 0) {
          setState((prev) => ({ ...prev, active: true }));
        }
      })
      .catch(() => {
        // Network error — activate demo
        if (!controller.signal.aborted) {
          setState((prev) => ({ ...prev, active: true }));
        }
      });

    return () => controller.abort();
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actions

  const activateDemo = useCallback(
    (vertical: DemoState["vertical"]) => {
      setState({
        active: true,
        vertical,
        act: 1,
        storyBeat: 0,
        visitedPages: new Set<string>(),
        inProgressRunId: inProgressRunIdRef.current,
      });
    },
    [],
  );

  const deactivateDemo = useCallback(() => {
    Object.values(DEMO_STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
    // Mark as explicitly dismissed so auto-detection doesn't re-activate
    localStorage.setItem(DEMO_STORAGE_KEYS.AUTO_DISMISSED, "true");
    setState((prev) => ({
      ...prev,
      active: false,
    }));
  }, []);

  const advanceBeat = useCallback(() => {
    setState((prev) => {
      const nextBeat = prev.storyBeat + 1;
      const isLastBeat = nextBeat >= STORYLINE_BEATS.length;
      return {
        ...prev,
        storyBeat: isLastBeat ? prev.storyBeat : nextBeat,
        act: isLastBeat ? 2 : prev.act,
      };
    });
  }, []);

  const setAct = useCallback((act: DemoState['act']) => {
    setState((prev) => ({ ...prev, act }));
  }, []);

  const markPageVisited = useCallback((path: string) => {
    setState((prev) => {
      const next = new Set(prev.visitedPages);
      next.add(path);
      return { ...prev, visitedPages: next };
    });
  }, []);

  const switchVertical = useCallback((vertical: DemoState["vertical"]) => {
    setState((prev) => ({
      ...prev,
      vertical,
      act: 0,
      storyBeat: 0,
      visitedPages: new Set<string>(),
    }));
  }, []);

  const restartTour = useCallback(() => {
    setState((prev) => ({
      ...prev,
      act: 1,
      storyBeat: 0,
      visitedPages: new Set<string>(),
    }));
  }, []);

  const actions = useMemo<DemoActions>(
    () => ({
      activateDemo,
      deactivateDemo,
      advanceBeat,
      setAct,
      markPageVisited,
      switchVertical,
      restartTour,
    }),
    [
      activateDemo,
      deactivateDemo,
      advanceBeat,
      setAct,
      markPageVisited,
      switchVertical,
      restartTour,
    ],
  );

  const value = useMemo<DemoModeContextType>(
    () => ({ state, actions }),
    [state, actions],
  );

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoContext(): DemoModeContextType {
  const context = useContext(DemoModeContext);
  if (context === undefined) {
    throw new Error(
      "useDemoContext must be used within a DemoModeProvider",
    );
  }
  return context;
}
