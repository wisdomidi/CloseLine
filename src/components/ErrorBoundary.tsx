import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          id="error-boundary-screen"
          className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans"
        >
          <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-mono font-bold text-white tracking-tight mb-2">
              Something went wrong
            </h1>

            <p className="text-sm font-sans text-zinc-400 leading-relaxed mb-4">
              CloseLine encountered an unexpected error while subscribing to live market data. Your assets and orders are secure.
            </p>

            {this.state.error && (
              <div className="w-full p-3 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-left mb-5 overflow-hidden">
                <span className="text-[10px] font-mono uppercase text-zinc-500 block mb-1">
                  Diagnostics:
                </span>
                <p className="font-mono text-xs text-rose-400 truncate">
                  {this.state.error.message || 'Unknown render exception'}
                </p>
              </div>
            )}

            <div className="w-full flex flex-col sm:flex-row gap-2.5">
              <button
                id="error-refresh-btn"
                type="button"
                onClick={this.handleRefresh}
                className="w-full py-3 px-4 rounded-xl font-mono text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Refresh Application</span>
              </button>

              <button
                id="error-retry-btn"
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto py-3 px-4 rounded-xl font-mono text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
