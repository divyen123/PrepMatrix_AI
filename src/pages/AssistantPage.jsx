import VoiceAssistant from "../components/VoiceAssistant";

function AssistantPage({ completed, onReset, schedule, setDarkMode }) {
  return (
    <section className="page-stack">
      <div className="section-intro">
        <span className="section-tag">Assistant</span>
        <h2>Voice and AI study controls</h2>
      </div>

      <VoiceAssistant
        completed={completed}
        onReset={onReset}
        schedule={schedule}
        setDarkMode={setDarkMode}
      />

      <div className="utility-row assistant-route-grid">
        <article className="utility-card">
          <span className="section-tag">Hands-free</span>
          <h3>Wake phrase and direct actions</h3>
          <p>
            Use the wake phrase for theme switching, reset confirmation,
            date and time, and quick planner commands without opening the chat first.
          </p>
        </article>

        <article className="utility-card">
          <span className="section-tag">Deep help</span>
          <h3>AI-backed study support</h3>
          <p>
            The floating assistant chat remains available across every route, so you can
            ask for summaries, recovery plans, and resource guidance from anywhere.
          </p>
        </article>
      </div>
    </section>
  );
}

export default AssistantPage;
