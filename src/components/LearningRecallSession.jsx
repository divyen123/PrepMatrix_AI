import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { getNotebookRecallCard, getNotebookRecallTopics } from "../utils/notebookRecall";
import "./LearningRecallSession.css";

const RATINGS = [
  { id: "again", label: "Again", hint: "I could not recall the main idea" },
  { id: "hard", label: "Hard", hint: "I recalled part of it" },
  { id: "good", label: "Good", hint: "I recalled the main points" },
  { id: "easy", label: "Easy", hint: "I recalled and explained it clearly" },
];

function ReferenceSection({ title, items }) {
  if (!items.length) return null;
  return (
    <section className="notebook-recall-reference__section">
      <h4>{title}</h4>
      {items.map((item, index) => <p key={`${title}-${index}`}>{item}</p>)}
    </section>
  );
}

export default function LearningRecallSession({
  notebook,
  nodes = [],
  selectedNode,
  progressByNodeId = {},
  activeSession,
  reviewQueue = [],
  latestReceipt,
  onSelectNode,
  onStartSession,
  onPauseSession,
  onFinishSession,
  onOpenNotes,
}) {
  const topics = useMemo(() => getNotebookRecallTopics(nodes), [nodes]);
  const dueTopicIds = useMemo(() => new Set(reviewQueue.map((item) => item.id)), [reviewQueue]);
  const currentNode = selectedNode?.type === "topic"
    ? selectedNode
    : topics.find((node) => dueTopicIds.has(node.id)) || topics[0] || null;
  const card = getNotebookRecallCard(notebook, currentNode);
  const sessionActive = Boolean(activeSession?.nodeId === currentNode?.id && !activeSession?.pausedAt);
  const [response, setResponse] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setResponse("");
    setRevealed(false);
    setSubmitting(false);
  }, [activeSession?.id, currentNode?.id]);

  if (!card) {
    return (
      <div className="notebook-recall-empty">
        <RotateCcw aria-hidden="true" size={25} />
        <h3>No topics to recall yet</h3>
        <p>Create a notebook with a topic outline to start a recall check.</p>
      </div>
    );
  }

  const progress = progressByNodeId?.[card.id] || {};
  const hasReference = Boolean(card.answer || card.outline.length || card.notes.length || card.examples.length || card.applications.length);

  return (
    <div className="notebook-recall">
      <header className="notebook-recall-header">
        <div>
          <span className="notebook-recall-eyebrow"><RotateCcw aria-hidden="true" size={16} /> Recall session</span>
          <h3>Check what you remember</h3>
          <p>Choose a topic, answer without looking, then compare with your notebook.</p>
        </div>
        <span className="notebook-recall-due"><Clock3 aria-hidden="true" size={15} /> {dueTopicIds.size} due for review</span>
      </header>

      <div className="notebook-recall-layout">
        <aside aria-label="Notebook recall topics" className="notebook-recall-topics">
          <h4>Topic outline</h4>
          <div className="notebook-recall-topics__list">
            {topics.map((node) => (
              <button
                aria-current={node.id === card.id ? "true" : undefined}
                className={node.id === card.id ? "is-active" : ""}
                key={node.id}
                onClick={() => onSelectNode?.(node.id)}
                type="button"
              >
                <strong>{node.title}</strong>
                <small>{dueTopicIds.has(node.id) ? "Review due" : progressByNodeId?.[node.id]?.status === "mastered" ? "Mastered" : "Recall"}</small>
              </button>
            ))}
          </div>
        </aside>

        <section aria-label="Recall check" className="notebook-recall-check">
          <div className="notebook-recall-check__heading">
            <span>{card.chapterName || notebook?.subjectName || "Notebook"}</span>
            <h4>{card.prompt}</h4>
            {progress.masteryScore > 0 ? <small>Current mastery: {Math.round(progress.masteryScore)}%</small> : null}
          </div>

          {!sessionActive ? (
            <div className="notebook-recall-start">
              <p>Write your answer first. Your result will update this topic’s mastery map and review schedule.</p>
              <button onClick={() => onStartSession?.(card.id)} type="button">Start recall</button>
            </div>
          ) : (
            <>
              <label className="notebook-recall-response">
                <span>Your answer</span>
                <textarea
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder="Explain the idea in your own words. Add an example if you can."
                  readOnly={revealed}
                  rows={6}
                  value={response}
                />
              </label>
              {!revealed ? (
                <div className="notebook-recall-actions">
                  <button disabled={!response.trim()} onClick={() => setRevealed(true)} type="button">Reveal and compare</button>
                  <button className="is-secondary" onClick={() => onPauseSession?.(activeSession)} type="button">Pause</button>
                </div>
              ) : (
                <div className="notebook-recall-reference">
                  <h3><BookOpenCheck aria-hidden="true" size={18} /> Notebook reference</h3>
                  {card.answer ? <ReferenceSection items={[card.answer]} title="Suggested answer" /> : null}
                  <ReferenceSection items={card.outline} title="Topic outline" />
                  <ReferenceSection items={card.notes} title="Revised notes" />
                  <ReferenceSection items={card.examples} title="Examples" />
                  <ReferenceSection items={card.applications} title="Applications" />
                  {!hasReference ? <p>Open revised notes and review this topic before rating your recall.</p> : null}
                  <p className="notebook-recall-reference__instruction">Compare your answer with the reference, then choose the rating that fits.</p>
                  <div aria-label="Rate your recall" className="notebook-recall-ratings">
                    {RATINGS.map((rating) => (
                      <button
                        disabled={submitting}
                        key={rating.id}
                        onClick={() => {
                          setSubmitting(true);
                          onFinishSession?.({
                            nodeId: card.id,
                            sessionId: activeSession?.id,
                            rating: rating.id,
                            response,
                          });
                        }}
                        type="button"
                      >
                        <strong>{rating.label}</strong>
                        <small>{rating.hint}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {latestReceipt?.nodeId === card.id && !sessionActive ? (
            <div aria-live="polite" className="notebook-recall-receipt" role="status">
              <CheckCircle2 aria-hidden="true" size={19} />
              <div><strong>Recall saved</strong><p>{latestReceipt.summary}</p></div>
              <b>{latestReceipt.masteryScore}%</b>
            </div>
          ) : null}
          {onOpenNotes ? <button className="notebook-recall-notes-link" onClick={onOpenNotes} type="button">Review revised notes</button> : null}
        </section>
      </div>
    </div>
  );
}
