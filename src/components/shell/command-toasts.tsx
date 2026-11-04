'use client';

import { useMemo, type ReactNode } from 'react';
import { useToast } from '@/components/ui/toast';
import { CommandFeedbackProvider, type CommandFeedback } from '@/core/commands';

/** Sends useCommand and useUndo outcomes to the kit toast host. */
export function CommandToasts({ children }: { children: ReactNode }) {
  const toast = useToast();
  const feedback = useMemo<CommandFeedback>(() => ({ notify: (tone, text) => toast[tone](text) }), [toast]);
  return <CommandFeedbackProvider value={feedback}>{children}</CommandFeedbackProvider>;
}
