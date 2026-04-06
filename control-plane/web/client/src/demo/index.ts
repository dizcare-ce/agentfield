// Barrel export for demo module
export { DemoModeProvider, useDemoContext } from './DemoModeContext';
export { DemoVerticalPicker } from './DemoVerticalPicker';
export { DemoStoryline } from './DemoStoryline';
export { DemoHotspot } from './DemoHotspot';
export { DemoPill } from './DemoPill';
export { DemoExitBanner } from './DemoExitBanner';
export { useDemoMode, isDemoActive } from './hooks/useDemoMode';
export { useDemoStream } from './hooks/useDemoStream';
export { useDemoDAG } from './hooks/useDemoDAG';
export {
  getScenario,
  getDemoData,
  getDemoAgentNodes,
  getDemoRuns,
  getDemoRunDAG,
  getDemoRunIds,
  createDemoQueryFn,
  clearDemoCache,
} from './mock/interceptor';
