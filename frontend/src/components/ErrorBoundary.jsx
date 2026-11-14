import { Component } from "react";

// If any screen crashes while drawing, show a message instead of a blank page.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Enersync screen crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boundary" role="alert">
        <h1>Something broke on this screen</h1>
        <p className="muted">{this.state.error.message}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.assign("/")}>
          Back to the dashboard
        </button>
      </div>
    );
  }
}
