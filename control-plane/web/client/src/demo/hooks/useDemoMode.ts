/**
 * Thin consumer hook for demo mode state.
 * Re-exports context values with convenience helpers.
 */

import { useDemoContext } from '../DemoModeContext';
import { DEMO_STORAGE_KEYS } from '../constants';
import type { DemoActions, DemoState, DemoVertical } from '../mock/types';

export interface UseDemoModeReturn {
  isDemoMode: boolean;
  vertical: DemoVertical | null;
  act: DemoState['act'];
  storyBeat: number;
  visitedPages: Set<string>;
  inProgressRunId: string;
  actions: DemoActions;
}

/** Primary hook for components that need demo state. */
export function useDemoMode(): UseDemoModeReturn {
  const { state, actions } = useDemoContext();
  return {
    isDemoMode: state.active,
    vertical: state.vertical,
    act: state.act,
    storyBeat: state.storyBeat,
    visitedPages: state.visitedPages,
    inProgressRunId: state.inProgressRunId,
    actions,
  };
}

/**
 * Standalone check for demo mode — reads localStorage directly.
 * Use outside React tree (e.g., in fetch interceptors, service workers).
 */
export function isDemoActive(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'true') return true;
    return localStorage.getItem(DEMO_STORAGE_KEYS.ACTIVE) === 'true';
  } catch {
    return false;
  }
}
