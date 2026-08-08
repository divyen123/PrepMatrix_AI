import { Component, Fragment } from "react";
import { ArrowLeft, BookOpenCheck, RefreshCw } from "lucide-react";
import "./LearningRouteBoundary.css";

class LearningRouteBoundary extends Component {
  state = { failed: false, retryKey: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, details) {
    console.error("Start Learning recovered from a rendering failure.", error, details);
  }

  retry = () => {
    try {
      window.sessionStorage?.setItem("page-has-been-force-refreshed", "false");
    } catch {
      // A blocked storage API must not prevent the recovery action.
    }
    this.setState((current) => ({ failed: false, retryKey: current.retryKey + 1 }));
  };

  render() {
    if (this.state.failed) {
      return (
        <section className="learning-route-recovery" role="status">
          <span className="learning-route-recovery__icon"><BookOpenCheck size={24} /></span>
          <span className="section-tag">Learning workspace protected</span>
          <h2>The studio paused safely</h2>
          <p>Your saved notebooks and learning progress are unchanged. Reopen the studio to continue.</p>
          <div className="learning-route-recovery__actions">
            <button onClick={this.retry} type="button"><RefreshCw size={16} /> Reopen studio</button>
            <a href="/dashboard"><ArrowLeft size={16} /> Dashboard</a>
          </div>
        </section>
      );
    }

    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}

export default LearningRouteBoundary;
