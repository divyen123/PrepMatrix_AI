import { CalendarPlus, MessageSquareText, Save } from "lucide-react";
import PlacementPrepContent from "./PlacementPrepContent";
import PlacementPrepDisclosure from "./PlacementPrepDisclosure";

export default function PlacementPrepTopicCard({
  topic, index, getActionTarget, getNoteOptions, isSaving, onSave, onAskAI, onAddToPlanner,
}) {
  const renderActions = (target) => {
    const saving = isSaving(target, getNoteOptions(target));
    return (
      <div className="learning-career-item-actions">
        <button disabled={saving} onClick={() => onSave(target)} type="button"><Save size={14} /> {saving ? "Saving..." : "Save"}</button>
        <button onClick={() => onAskAI(target, topic)} type="button"><MessageSquareText size={14} /> Ask AI</button>
        <button onClick={() => onAddToPlanner(target)} type="button"><CalendarPlus size={14} /> Add to planner</button>
      </div>
    );
  };
  const questions = Array.isArray(topic?.interviewQuestions) ? topic.interviewQuestions : [];
  const practiceSteps = Array.isArray(topic?.practiceSteps) ? topic.practiceSteps : [];
  const hasSupport = Boolean(topic?.whyItMatters?.trim() || questions.length || practiceSteps.length);
  return (
    <article className={hasSupport ? "learning-career-topic-card" : "learning-career-topic-card is-explanation-only"}>
      <div className="learning-career-topic-overview">
        <header className="learning-career-topic-heading">
          <span className="learning-career-topic-number">{String(index + 1).padStart(2, "0")}</span>
          <h4>{String(topic?.title || "").trim().slice(0, 180)}</h4>
        </header>
        <PlacementPrepContent text={topic?.explanation} />
      </div>
      {hasSupport && (
        <div className="learning-career-topic-support">
          {topic?.whyItMatters?.trim() && (
            <aside className="learning-career-support-section is-relevance">
              <strong>Why it matters</strong>
              <PlacementPrepContent text={topic.whyItMatters} />
            </aside>
          )}
          {questions.length > 0 && (
            <section className="learning-career-support-section is-interview" aria-label="Interview checks">
              <h5>Interview checks</h5>
              {questions.map((question, questionIndex) => {
                const target = getActionTarget(topic, question, "interview", questionIndex);
                return (
                  <PlacementPrepDisclosure key={target.id} label={String(question?.question || question).trim().slice(0, 700)}>
                    <div className="learning-career-answer">
                      <strong className="learning-career-answer-label">Answer</strong>
                      {target.explanation ? <PlacementPrepContent text={target.explanation} /> : (
                        <p>An answer was not saved for this question. Use Ask AI to get a question-specific answer.</p>
                      )}
                    </div>
                    {renderActions(target)}
                  </PlacementPrepDisclosure>
                );
              })}
            </section>
          )}
          {practiceSteps.length > 0 && (
            <section className="learning-career-support-section is-practice" aria-label="Practice next">
              <h5>Practice next</h5>
              <div className="learning-career-practice-list">
                {practiceSteps.map((step, stepIndex) => {
                  const target = getActionTarget(topic, step, "practice", stepIndex);
                  return (
                    <PlacementPrepDisclosure key={target.id} label={String(step?.title || step?.text || step).trim().slice(0, 500)}>
                      <div className="learning-career-answer"><PlacementPrepContent text={target.explanation} /></div>
                      {renderActions(target)}
                    </PlacementPrepDisclosure>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </article>
  );
}
