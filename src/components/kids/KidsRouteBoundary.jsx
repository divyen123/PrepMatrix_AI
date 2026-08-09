import { Component } from "react";

export default class KidsRouteBoundary extends Component {
  state = { failed: false, retryKey: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, details) {
    console.error("Kids Play & Learn recovered from a rendering failure.", error, details);
  }

  retry = () => {
    this.setState((current) => ({
      failed: false,
      retryKey: current.retryKey + 1,
    }));
  };

  render() {
    if (this.state.failed) {
      return (
        <section className="kids-route-recovery" role="alert">
          <span aria-hidden="true">🧭</span>
          <h2>Your adventure is safe</h2>
          <p>That screen paused unexpectedly. Your completed games and rewards are still saved.</p>
          <button onClick={this.retry} type="button">Return to the adventure map</button>
        </section>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
