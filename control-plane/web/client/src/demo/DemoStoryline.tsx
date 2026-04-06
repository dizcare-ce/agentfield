/**
 * Floating narrative card for Act 1 (guided discovery).
 * Shows storyline beats and advances when user takes actions.
 */

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { STORYLINE_BEATS } from './constants';
import { useDemoMode } from './hooks/useDemoMode';
import { getDemoRunIds } from './mock/interceptor';

export function DemoStoryline() {
  const navigate = useNavigate();
  const { isDemoMode, act, storyBeat, vertical, actions } = useDemoMode();

  const beat = STORYLINE_BEATS[storyBeat];
  const isVisible = isDemoMode && act === 1 && beat != null && vertical != null;

  const runIds = useMemo(
    () => (vertical ? getDemoRunIds(vertical) : null),
    [vertical],
  );

  /** Interpolate placeholders in beat text */
  const interpolatedText = useMemo(() => {
    if (!beat || !vertical || !runIds) return '';
    return beat.text
      .replace(/\{vertical\}/g, vertical === 'healthcare' ? 'clinical decision support' : vertical === 'finance' ? 'transaction risk assessment' : 'intelligent incident response')
      .replace(/\{nodeCount\}/g, '47')
      .replace(/\{agentNodeCount\}/g, vertical === 'saas' ? '5' : '4')
      .replace(/\{heroRunId\}/g, runIds.heroRunId)
      .replace(/\{failedRunId\}/g, runIds.failedRunId)
      .replace(/\{runCount\}/g, '100');
  }, [beat, vertical, runIds]);

  /** Interpolate route placeholders */
  const targetRoute = useMemo(() => {
    if (!beat || !runIds) return '';
    return beat.targetRoute
      .replace(/\{heroRunId\}/g, runIds.heroRunId)
      .replace(/\{failedRunId\}/g, runIds.failedRunId);
  }, [beat, runIds]);

  const handleAction = useCallback(() => {
    if (targetRoute) {
      navigate(targetRoute);
    }
    actions.advanceBeat();
  }, [targetRoute, navigate, actions]);

  const handleSkip = useCallback(() => {
    actions.setAct(2);
  }, [actions]);

  const handleDismiss = useCallback(() => {
    actions.setAct(2);
  }, [actions]);

  if (!isVisible) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`beat-${storyBeat}`}
        className="fixed bottom-6 right-6 z-50 w-[380px]"
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <Card className="border-primary/20 shadow-lg">
          <CardContent className="relative p-4">
            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>

            {/* Beat text */}
            <p className="pr-6 text-sm leading-relaxed text-foreground">
              {interpolatedText}
            </p>

            {/* Action row */}
            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-3">
                {/* Progress dots */}
                <div className="flex gap-1">
                  {STORYLINE_BEATS.map((_, i) => (
                    <div
                      key={i}
                      className={`size-1.5 rounded-full transition-colors ${
                        i === storyBeat
                          ? 'bg-primary'
                          : i < storyBeat
                            ? 'bg-primary/40'
                            : 'bg-muted-foreground/20'
                      }`}
                    />
                  ))}
                </div>

                {beat.actionLabel && (
                  <Button size="sm" variant="default" onClick={handleAction} className="h-7 gap-1.5 text-xs">
                    {beat.actionLabel}
                    <ArrowRight className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
