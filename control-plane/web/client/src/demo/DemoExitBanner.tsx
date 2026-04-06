/**
 * Full-width banner shown when demo mode is deactivated.
 * Offers: Connect agents, Back to demo, Dismiss.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DEMO_STORAGE_KEYS } from './constants';

interface DemoExitBannerProps {
  /** Whether to show the banner */
  visible: boolean;
  /** Label for the vertical that was active */
  verticalLabel: string;
  /** Callback to reactivate demo */
  onBackToDemo: () => void;
}

export function DemoExitBanner({ visible, verticalLabel, onBackToDemo }: DemoExitBannerProps) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DEMO_STORAGE_KEYS.EXIT_DISMISSED) === 'true';
    } catch {
      return false;
    }
  });

  const show = visible && !dismissed;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DEMO_STORAGE_KEYS.EXIT_DISMISSED, 'true');
    } catch { /* ignore */ }
  };

  const handleConnect = () => {
    handleDismiss();
    navigate('/dashboard');
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <Alert variant="default" className="rounded-none border-x-0 border-t-0">
            <AlertCircle className="size-4" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-sm">
                You were viewing demo data from the <strong>{verticalLabel}</strong> scenario.
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleConnect} className="h-7 text-xs">
                  Connect your agents
                </Button>
                <Button variant="ghost" size="sm" onClick={onBackToDemo} className="h-7 text-xs">
                  Back to demo
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 text-xs text-muted-foreground">
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
