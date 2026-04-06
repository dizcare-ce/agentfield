/**
 * Pulsing attention ring that wraps any element.
 * Shows in Act 2+ for pages the user hasn't visited yet.
 */

import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useDemoMode } from './hooks/useDemoMode';

interface DemoHotspotProps {
  /** Unique identifier for this hotspot */
  id: string;
  /** Route path this hotspot corresponds to */
  route: string;
  /** One-line hint shown on hover */
  hint: string;
  children: ReactNode;
}

export function DemoHotspot({ id, route, hint, children }: DemoHotspotProps) {
  const { isDemoMode, act, visitedPages } = useDemoMode();

  const shouldShow = isDemoMode && act >= 2 && !visitedPages.has(route);

  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {shouldShow && (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <motion.div
                  key={`hotspot-${id}`}
                  className="pointer-events-none absolute inset-0 rounded-md"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-md border-2 border-primary/30"
                    animate={{
                      scale: [1, 1.06, 1],
                      opacity: [0.6, 1, 0.6],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  />
                </motion.div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-[200px]">
                <p className="text-xs">{hint}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </AnimatePresence>
    </div>
  );
}
