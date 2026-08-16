// Top-level error boundary.
//
// Without this, any error thrown during render unmounts the whole React tree
// and the user sees a blank white screen with no explanation. This catches
// those errors, shows a friendly recovery screen with a reload button, and —
// crucially — surfaces the actual error message so on-device crashes can be
// diagnosed instead of guessed at.
import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Logged so it also shows up in Xcode / Android Studio / Safari DevTools.
    console.error("[ErrorBoundary] render crash", error, info?.componentStack);
  }

  handleReload = () => {
    // Full reload re-runs bootstrapping from scratch.
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "24px",
          paddingTop: "max(24px, env(safe-area-inset-top))",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          boxSizing: "border-box",
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#1f2937",
          background: "#f9fafb",
        }}
      >
        <div style={{ fontSize: 44 }}>🌱</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>Er ging iets mis</h1>
        <p style={{ fontSize: 15, color: "#6b7280", margin: 0, maxWidth: 320 }}>
          De app liep tegen een fout aan. Probeer opnieuw te laden.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: 8,
            padding: "12px 24px",
            fontSize: 16,
            fontWeight: 600,
            color: "#fff",
            background: "#16a34a",
            border: "none",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          Opnieuw laden
        </button>
        <details style={{ marginTop: 16, maxWidth: 340, width: "100%" }}>
          <summary style={{ fontSize: 13, color: "#9ca3af", cursor: "pointer" }}>
            Technische details
          </summary>
          <pre
            style={{
              marginTop: 8,
              fontSize: 11,
              lineHeight: 1.4,
              color: "#b91c1c",
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 12,
              textAlign: "left",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowX: "auto",
            }}
          >
            {String(error?.stack || error?.message || error)}
          </pre>
        </details>
      </div>
    );
  }
}
