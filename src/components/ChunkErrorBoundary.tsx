import { Component } from "react";
import type { ReactNode } from "react";

interface ChunkErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ChunkErrorBoundaryState {
  hasError: boolean;
}

// A failed lazy import rejects during render. Without a boundary the rejection
// unmounts the whole tree and the user sees a blank page. This boundary keeps
// the failure local and shows a recovery message instead.
export class ChunkErrorBoundary extends Component<
  ChunkErrorBoundaryProps,
  ChunkErrorBoundaryState
> {
  state: ChunkErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ChunkErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
