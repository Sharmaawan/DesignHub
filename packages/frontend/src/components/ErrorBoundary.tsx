import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, any uncaught render-time error anywhere in the tree (e.g. a
// component choking on a malformed API response) unmounts the entire app —
// the "blank white page, stuck until refresh" failure mode. This catches
// that at the root and offers a recoverable fallback instead.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
          <div className="max-w-md text-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Something went wrong</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              An unexpected error occurred. Your work up to the last save is safe — reloading will get you back to the editor.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-canva-purple text-white rounded-lg text-sm font-semibold hover:bg-canva-purple/90"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
