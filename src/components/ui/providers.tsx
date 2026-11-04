'use client';

import type { ReactNode } from 'react';
import { DialogsProvider } from './dialogs';
import { ToastProvider } from './toast';

/** Mounted once in the root layout: the toast host and the promise-based dialogs. */
export function UiProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <DialogsProvider>{children}</DialogsProvider>
    </ToastProvider>
  );
}

export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-70 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-on-primary"
    >
      Bỏ qua, đến nội dung chính
    </a>
  );
}
