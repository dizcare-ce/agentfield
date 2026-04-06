/**
 * Vertical selection dialog for demo mode (Act 0).
 * Shows three industry cards — user picks one to populate demo data.
 */

import { useState } from 'react';
import { Heart, TrendingUp, Cpu } from 'lucide-react';
import { motion } from 'motion/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { VERTICALS } from './constants';
import type { DemoVertical } from './mock/types';

const ICON_MAP = {
  Heart,
  TrendingUp,
  Cpu,
} as const;

interface DemoVerticalPickerProps {
  open: boolean;
  onSelect: (vertical: DemoVertical) => void;
  /** Whether the picker can be dismissed (false on first launch) */
  dismissable?: boolean;
  onClose?: () => void;
}

export function DemoVerticalPicker({
  open,
  onSelect,
  dismissable = false,
  onClose,
}: DemoVerticalPickerProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && dismissable && onClose) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[720px]"
        onPointerDownOutside={(e) => {
          if (!dismissable) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissable) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            What are you building?
          </DialogTitle>
          <DialogDescription className="text-center text-muted-foreground">
            Pick an industry to see AgentField in action with realistic data
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-3">
          {VERTICALS.map((v, i) => {
            const Icon = ICON_MAP[v.icon as keyof typeof ICON_MAP];
            return (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
                <Card
                  className={`cursor-pointer transition-all duration-200 hover:border-primary/50 hover:shadow-md ${
                    hovered === v.id ? 'border-primary/50 shadow-md' : ''
                  }`}
                  onMouseEnter={() => setHovered(v.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => onSelect(v.id)}
                >
                  <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                    {Icon && (
                      <div className="rounded-lg bg-primary/10 p-3">
                        <Icon className="size-6 text-primary" />
                      </div>
                    )}
                    <div className="text-sm font-semibold">{v.label}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {v.description}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
