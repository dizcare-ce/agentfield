/**
 * Floating "Demo Mode" indicator with dropdown menu.
 * Shows in Act 2+ as a compact pill in the top-right corner.
 */

import { Heart, TrendingUp, Cpu, RotateCcw, ArrowRightLeft, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDemoMode } from './hooks/useDemoMode';

const VERTICAL_ICONS = {
  healthcare: Heart,
  finance: TrendingUp,
  saas: Cpu,
} as const;

const VERTICAL_LABELS = {
  healthcare: 'Healthcare',
  finance: 'Finance',
  saas: 'SaaS',
} as const;

interface DemoPillProps {
  onSwitchVertical: () => void;
}

export function DemoPill({ onSwitchVertical }: DemoPillProps) {
  const { isDemoMode, act, vertical, actions } = useDemoMode();

  const isVisible = isDemoMode && act >= 2 && vertical != null;

  if (!isVisible || !vertical) return null;

  const Icon = VERTICAL_ICONS[vertical];
  const label = VERTICAL_LABELS[vertical];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed right-4 top-4 z-40"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Badge
              variant="outline"
              className="cursor-pointer gap-1.5 border-primary/30 bg-background/80 px-3 py-1.5 backdrop-blur-sm hover:bg-accent transition-colors"
            >
              <Icon className="size-3.5 text-primary" />
              <span className="text-xs font-medium">Demo: {label}</span>
            </Badge>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onSwitchVertical}>
              <ArrowRightLeft className="mr-2 size-4" />
              Switch vertical
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.restartTour()}>
              <RotateCcw className="mr-2 size-4" />
              Restart tour
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.deactivateDemo()}>
              <LogOut className="mr-2 size-4" />
              Exit demo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>
    </AnimatePresence>
  );
}
