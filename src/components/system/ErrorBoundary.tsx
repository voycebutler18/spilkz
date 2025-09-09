// src/components/system/ErrorBoundary.tsx
import { Component, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error("[App ErrorBoundary] error:", error, "info:", info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: "#0b0b0f",
          color: "#eaeaea",
          textAlign: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        }}
      >
        <div style={{ maxWidth: 680 }}>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>
            Something went wrong 😵‍💫
          </h1>
          <p style={{ opacity: 0.85, marginBottom: 16 }}>
            The UI crashed while rendering. Check the console near the line
            starting with <code>[App ErrorBoundary]</code>.
          </p>
          {this.state.error?.message ? (
            <pre
              style={{
                textAlign: "left",
                whiteSpace: "pre-wrap",
                background: "#151515",
                padding: 12,
                borderRadius: 8,
                border: "1px solid #2b2b2b",
                marginBottom: 16,
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {String(this.state.error.message)}
            </pre>
          ) : null}
          <button
            onClick={() => (window.location.href = window.location.origin)}
            style={{
              background: "white",
              color: "black",
              borderRadius: 8,
              padding: "10px 16px",
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
