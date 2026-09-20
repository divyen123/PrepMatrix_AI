import { CalendarPlus, Code2, MessageSquareText, Save } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { isCodingPlacementItem } from "../utils/placementPreparation";
import PlacementPrepContent from "./PlacementPrepContent";
import PlacementPrepDisclosure from "./PlacementPrepDisclosure";

export default function PlacementPrepTopicCard({
  codingRelevant = false,
  codeMatrixAvailable = false,
  topic,
  index,
  getActionTarget,
  getNoteOptions,
  isSaving,
  onSave,
  onAskAI,
  onAddToPlanner,
  onCode,
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
  const codingPracticeIndex = practiceSteps.findIndex((item) => (
    isCodingPlacementItem({ codingRelevant, item, topic })
  ));
  const codingQuestionIndex = questions.findIndex((item) => (
    isCodingPlacementItem({ codingRelevant, item, topic })
  ));
  const topicIsCoding = isCodingPlacementItem({ codingRelevant, topic });
  const codeTarget = codeMatrixAvailable && typeof onCode === "function"
    ? codingPracticeIndex >= 0
      ? getActionTarget(topic, practiceSteps[codingPracticeIndex], "practice", codingPracticeIndex)
      : codingQuestionIndex >= 0
        ? getActionTarget(topic, questions[codingQuestionIndex], "interview", codingQuestionIndex)
        : topicIsCoding
          ? getActionTarget(topic, {
              id: `${topic?.id || "placement-topic"}-code-practice`,
              title: `Implement ${topic?.title || "this placement topic"}`,
            }, "practice", 0)
          : null
    : null;
  const overviewRef = useRef(null);
  const practiceRef = useRef(null);
  const [practiceLayout, setPracticeLayout] = useState("side");

  useLayoutEffect(() => {
    if (!practiceSteps.length || practiceLayout !== "side") return undefined;

    const measurePracticeSpace = () => {
      const overviewRect = overviewRef.current?.getBoundingClientRect();
      const practiceRect = practiceRef.current?.getBoundingClientRect();
      if (!overviewRect || !practiceRect) return;

      // Practice is safe to span the card when the overview has ended before
      // the right column reaches it. If the overview is still flowing, keep
      // Practice next in that column so the two sections never collide.
      if (overviewRect.bottom <= practiceRect.top + 4) setPracticeLayout("wide");
    };

    const frame = window.requestAnimationFrame(measurePracticeSpace);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measurePracticeSpace);
    if (resizeObserver) {
      if (overviewRef.current) resizeObserver.observe(overviewRef.current);
      if (practiceRef.current) resizeObserver.observe(practiceRef.current);
    }
    window.addEventListener("resize", measurePracticeSpace);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measurePracticeSpace);
    };
  }, [practiceLayout, practiceSteps.length]);

  const renderPracticeSection = () => practiceSteps.length > 0 && (
    <section
      aria-label="Practice next"
      className="learning-career-support-section is-practice"
      ref={practiceRef}
    >
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
  );

  const topicClassName = [
    "learning-career-topic-card",
    hasSupport ? "" : "is-explanation-only",
    practiceLayout === "wide" ? "is-practice-wide" : "",
  ].filter(Boolean).join(" ");

  return (
    <article className={topicClassName}>
      <div className="learning-career-topic-overview" ref={overviewRef}>
        <header className="learning-career-topic-heading">
          <span className="learning-career-topic-number">{String(index + 1).padStart(2, "0")}</span>
          <h4>{String(topic?.title || "").trim().slice(0, 180)}</h4>
          {codeTarget?.metadata?.codingRelevant && (
            <button
              aria-label={`Code ${String(topic?.title || "this topic").trim().slice(0, 180)} yourself in CodeMatrix`}
              className="learning-career-code-action"
              onClick={() => onCode(codeTarget, topic)}
              title="Open this topic in CodeMatrix"
              type="button"
            >
              <Code2 aria-hidden="true" size={13} />
              <span>Code it yourself</span>
            </button>
          )}
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
          {practiceLayout === "side" && renderPracticeSection()}
        </div>
      )}
      {practiceLayout === "wide" && renderPracticeSection()}
    </article>
  );
}
