'use client';

import { createContext, useContext } from 'react';

/** Context for sales loading state — provided by page.tsx, consumed by any view */
export interface SalesLoadingState {
  salesLoading: boolean;
  salesLoadingProgress: string;
}

export const SalesLoadingContext = createContext<SalesLoadingState>({
  salesLoading: false,
  salesLoadingProgress: '',
});

export function useSalesLoading() {
  return useContext(SalesLoadingContext);
}

/**
 * Drop-in banner that shows when sales data is still streaming.
 * Views that depend on raw sales[] should include this at the top.
 * Only renders when salesLoading is true.
 */
export default function SalesLoadingBanner() {
  const { salesLoading, salesLoadingProgress } = useSalesLoading();

  if (!salesLoading) return null;

  return (
    <div className="bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-800 rounded-lg px-4 py-2.5 flex items-center gap-3 animate-pulse">
      <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" />
      <p className="text-sm text-cyan-800 dark:text-cyan-200 font-medium">
        {salesLoadingProgress || 'Loading sales data...'}
        <span className="text-cyan-600 dark:text-cyan-400 font-normal ml-2">
          Numbers may update as data arrives.
        </span>
      </p>
    </div>
  );
}
