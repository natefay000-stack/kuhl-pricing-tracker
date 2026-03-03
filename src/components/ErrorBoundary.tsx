'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Wifi } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Name shown in the error UI (e.g. "Dashboard", "Sales") */
  viewName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed')
  );
}

/**
 * Catches runtime errors in any child component tree and shows a
 * friendly fallback instead of a blank screen.
 *
 * ChunkLoadError gets special treatment: auto-reload after a brief delay
 * (since these are always caused by stale cached chunks).
 */
export default class ErrorBoundary extends Component<Props, State> {
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isChunkError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.viewName ? ` – ${this.props.viewName}` : ''}]`, error, info.componentStack);

    // Auto-reload on chunk errors after a brief delay
    if (isChunkLoadError(error)) {
      console.warn('[ErrorBoundary] ChunkLoadError detected — reloading page in 2s...');
      this.reloadTimer = setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }

  componentWillUnmount() {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
  }

  handleReset = () => {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.setState({ hasError: false, error: null, isChunkError: false });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Special UI for ChunkLoadError — friendlier, auto-reloads
      if (this.state.isChunkError) {
        return (
          <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
            <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl p-8 max-w-lg w-full">
              <Wifi className="w-12 h-12 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 mb-2">
                Loading updated content...
              </h2>
              <p className="text-sm text-amber-600 dark:text-amber-300 mb-4">
                The app has been updated. Refreshing automatically...
              </p>
              <div className="flex items-center justify-center gap-3">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <button
                  onClick={this.handleReload}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload Now
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Standard error UI for other errors
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl p-8 max-w-lg w-full">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
              {this.props.viewName
                ? `Something went wrong in ${this.props.viewName}`
                : 'Something went wrong'}
            </h2>
            <p className="text-sm text-red-600 dark:text-red-300 mb-4">
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
