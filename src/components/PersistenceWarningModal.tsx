'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, RefreshCw, X } from 'lucide-react';

interface PersistenceWarningModalProps {
  failedTypes: string[];
  errorDetails: string;
  onAcknowledge: () => void;
  onRetryImport: () => void;
}

export default function PersistenceWarningModal({
  failedTypes,
  errorDetails,
  onAcknowledge,
  onRetryImport,
}: PersistenceWarningModalProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop — no click-to-dismiss */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal card */}
      <div className="relative bg-surface rounded-xl shadow-2xl border border-primary max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-primary">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Import Not Saved</h2>
            <p className="text-sm text-text-muted">Database write failed</p>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            Your <strong className="text-amber-400">{failedTypes.join(', ')}</strong> data was
            loaded into the current session but <strong className="text-red-400">could not be saved
            to the database</strong>.
          </p>

          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-sm text-amber-300 font-medium">
              This data will be lost when you refresh or close the page.
            </p>
          </div>

          <p className="text-sm text-text-muted">
            Try re-importing the file. If the problem persists, the database may be temporarily
            unavailable or at capacity.
          </p>

          {/* Collapsible error details */}
          {errorDetails && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showDetails ? 'rotate-0' : '-rotate-90'}`}
                />
                Technical details
              </button>
              {showDetails && (
                <pre className="mt-2 p-2.5 bg-surface-secondary rounded-lg text-xs text-text-muted overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                  {errorDetails}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-primary">
          <button
            onClick={onAcknowledge}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            I Understand
          </button>
          <button
            onClick={onRetryImport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Re-Import
          </button>
        </div>
      </div>
    </div>
  );
}
