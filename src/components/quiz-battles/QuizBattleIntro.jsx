import { Swords } from "lucide-react";

export default function QuizBattleIntro({ phase = "playing" }) {
  return (
    <section
      aria-busy="true"
      aria-describedby="quiz-battle-intro-description"
      aria-labelledby="quiz-battle-intro-title"
      aria-live="polite"
      className={`quiz-battle-intro is-${phase}`}
      role="status"
    >
      <div className="quiz-battle-intro__glow" aria-hidden="true" />

      <div className="quiz-battle-intro__mark" aria-hidden="true">
        <span className="quiz-battle-intro__orbit" />
        <span className="quiz-battle-intro__orbit is-inner" />
        <span className="quiz-battle-intro__spark is-one" />
        <span className="quiz-battle-intro__spark is-two" />
        <span className="quiz-battle-intro__spark is-three" />
        <Swords size={52} strokeWidth={1.8} />
      </div>

      <div className="quiz-battle-intro__copy">
        <span className="quiz-battle-intro__reveal quiz-battle-intro__eyebrow">
          <span>Asynchronous 1v1</span>
        </span>
        <h2 className="quiz-battle-intro__reveal" id="quiz-battle-intro-title">
          <span>Challenge a friend to a topic duel</span>
        </h2>
        <p
          className="quiz-battle-intro__reveal"
          id="quiz-battle-intro-description"
        >
          <span>
            One shared AI quiz, private results, server-scored answers, and XP that counts in Study Momentum.
          </span>
        </p>
      </div>

      <div className="quiz-battle-intro__progress" aria-hidden="true">
        <span />
      </div>
      <span className="quiz-battle-intro__status">Preparing Quiz Battles…</span>
    </section>
  );
}
