"use client";

import { Component, type ReactNode } from "react";
import { StateMessage } from "./primitives";

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Contains a failing panel so one broken component never takes down the timing screen. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error(`[${this.props.label}]`, error);
  }

  override render() {
    if (this.state.error) {
      return (
        <StateMessage
          kind="error"
          title={`${this.props.label} failed to render`}
          action={
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          }
        >
          {this.state.error.message}
        </StateMessage>
      );
    }
    return this.props.children;
  }
}
