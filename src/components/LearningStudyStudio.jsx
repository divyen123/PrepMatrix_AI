import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileQuestion,
  Gauge,
  Lightbulb,
  Map as MapIcon,
  Mic,
  NotebookPen,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Target,
  Trophy,
  WandSparkles,
  X,
} from "lucide-react";
import "./LearningStudyStudio.css";

const SESSION_STEPS = [
  { id: "learn", label: "Learn", description: "Understand the key idea", icon: BookOpenCheck },
  { id: "recall", label: "Recall", description: "Retrieve it from memory", icon: RotateCcw },
  { id: "practice", label: "Practice", description: "Apply it to a scenario", icon: Target },
  { id: "teach", label: "Teach back", description: "Explain it in simple words", icon: Mic },
  { id: "prove", label: "Prove", description: "Complete the mastery check", icon: Trophy },
];

const SELF_RATINGS = [
  { id: "again", label: "Again", hint: "I missed most of it" },
  { id: "hard", label: "Hard", hint: "I recalled some with effort" },
  { id: "good", label: "Good", hint: "I got the main ideas" },
  { id: "easy", label: "Easy", hint: "My answer was clear and complete" },
];

const COACH_ACTIONS = [
  { id: "simpler", label: "Explain simpler", icon: Lightbulb },
  { id: "analogy", label: "Give an analogy", icon: WandSparkles },
  { id: "hint", label: "Hint only", icon: Sparkles },
  { id: "example", label: "Another example", icon: FileQuestion },
  { id: "challenge", label: "Challenge me", icon: Target },
];

const STATUS_LABELS = {
  new: "New",
  ready: "Ready",
  learning: "Learning",
  learned: "Learned",
  review_due: "Review due",
  mastered: "Mastered",
};

const STOP_WORDS = new Set([
  "about", "after", "again", "also", "because", "before", "being", "between", "could",
  "does", "each", "from", "have", "into", "more", "most", "other", "should", "that",
  "their", "there", "these", "they", "this", "through", "using", "what", "when", "where",
  "which", "with", "would", "your",
]);

function stateFor(source, nodeId) {
  if (source instanceof globalThis.Map) return source.get(nodeId) || {};
  return source?.[nodeId] || {};
}

function cleanLines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return value ? [String(value).trim()] : [];
}

function nodeAnswer(node) {
  return [
    node?.explanation || node?.summary,
    cleanLines(node?.keyPoints).length ? `Key ideas: ${cleanLines(node.keyPoints).join("; ")}` : "",
    cleanLines(node?.examples).length ? `Example: ${cleanLines(node.examples).slice(0, 2).join("; ")}` : "",
    cleanLines(node?.applications).length ? `Applications: ${cleanLines(node.applications).join("; ")}` : "",
  ].filter(Boolean).join("\n\n") || `Review the meaning, purpose, and a practical example of ${node?.title || "this concept"}.`;
}

function SelfRatingButtons({ onRate }) {
  return (
    <div className="learning-studio-rating-grid">
      {SELF_RATINGS.map((rating) => (
        <button key={rating.id} onClick={() => onRate(rating.id)} type="button">
          <strong>{rating.label}</strong>
          <small>{rating.hint}</small>
        </button>
      ))}
    </div>
  );
}

function significantTerms(node) {
  const source = [node?.title, node?.summary, ...cleanLines(node?.keyPoints)].join(" ").toLowerCase();
  const terms = source.match(/[a-z][a-z0-9-]{3,}/g) || [];
  return [...new Set(terms.filter((term) => !STOP_WORDS.has(term)))].slice(0, 12);
}

function teachBackResult(node, response) {
  const terms = significantTerms(node);
  const normalized = String(response || "").toLowerCase();
  const matched = terms.filter((term) => normalized.includes(term));
  const minimumLengthScore = Math.min(35, Math.floor(normalized.trim().length / 5));
  const coverageScore = terms.length ? Math.round((matched.length / terms.length) * 65) : 35;
  const score = Math.min(100, minimumLengthScore + coverageScore);
  return {
    score,
    matched,
    missing: terms.filter((term) => !matched.includes(term)).slice(0, 5),
  };
}

function studyLabType(node) {
  const text = `${node?.subjectName || ""} ${node?.chapterName || ""} ${node?.title || ""}`.toLowerCase();
  if (/code|program|algorithm|data structure|software|computer|sql|database/.test(text)) return "trace";
  if (/math|physics|calculus|algebra|statistic|probability|circuit|force|motion/.test(text)) return "predict";
  return "connect";
}

function StudyLab({ node, response, onResponseChange }) {
  const [parameter, setParameter] = useState(55);
  const type = studyLabType(node);
  const keyPoints = cleanLines(node?.keyPoints).slice(0, 4);
  const examples = cleanLines(node?.examples);
  const applications = cleanLines(node?.applications);
  const scenario = applications[0] || examples[0] || "";
  const addStartingPoint = (point) => {
    const prefix = response.trim() ? `${response.trimEnd()}\n` : "";
    onResponseChange(`${prefix}${point}: `);
  };

  if (type === "trace") {
    return (
      <div className="learning-studio-lab is-trace">
        <span className="learning-studio-lab__badge">Trace lab</span>
        <h4>Apply {node?.title || "the concept"} step by step</h4>
        {scenario ? <p className="learning-studio-lab__scenario"><strong>Scenario:</strong> {scenario}</p> : null}
        <div className="learning-studio-lab__chips">
          {(keyPoints.length ? keyPoints : ["Input", "Transformation", "Output"]).map((point) => (
            <button key={point} onClick={() => addStartingPoint(point)} type="button">{point}</button>
          ))}
        </div>
        <textarea
          aria-label="Trace your reasoning"
          onChange={(event) => onResponseChange(event.target.value)}
          placeholder="Explain the input, decision, output, and one edge case..."
          rows={5}
          value={response}
        />
      </div>
    );
  }

  if (type === "predict") {
    return (
      <div className="learning-studio-lab is-predict">
        <span className="learning-studio-lab__badge">Prediction lab</span>
        <h4>Predict how {node?.title || "the concept"} responds to change</h4>
        {scenario ? <p className="learning-studio-lab__scenario"><strong>Starting scenario:</strong> {scenario}</p> : null}
        <label>
          <span>Change the scenario parameter</span>
          <input onChange={(event) => setParameter(Number(event.target.value))} type="range" min="10" max="100" value={parameter} />
          <strong>{parameter}%</strong>
        </label>
        <p>Assume a main input becomes {parameter}% of its original value. What changes, what stays constant, and why?</p>
        <textarea
          aria-label="Write your prediction"
          onChange={(event) => onResponseChange(event.target.value)}
          placeholder="My prediction is... because..."
          rows={5}
          value={response}
        />
      </div>
    );
  }

  return (
    <div className="learning-studio-lab is-connect">
      <span className="learning-studio-lab__badge">Connection lab</span>
      <h4>Connect {node?.title || "the concept"} to a real situation</h4>
      {scenario ? <p className="learning-studio-lab__scenario"><strong>Use this situation:</strong> {scenario}</p> : null}
      <div className="learning-studio-lab__chips">
        {(keyPoints.length ? keyPoints : [node?.title, "Cause", "Effect"]).filter(Boolean).map((point) => (
          <button key={point} onClick={() => addStartingPoint(point)} type="button">{point}</button>
        ))}
      </div>
      <textarea
        aria-label="Explain the connection"
        onChange={(event) => onResponseChange(event.target.value)}
        placeholder="This connects to... The relationship matters because..."
        rows={5}
        value={response}
      />
    </div>
  );
}

function LearningStudyStudio({
  notebook,
  nodes = [],
  selectedNode,
  progressByNodeId,
  activeSession,
  reviewQueue = [],
  latestReceipt,
  coachState = {},
  isSavingNote,
  onSelectNode,
  onStartSession,
  onPauseSession,
  onAdvanceSession,
  onRecordAttempt,
  onFinishSession,
  onCoachAction,
  onSaveToNotes,
  onReferMaterial,
  onOpenMap,
  onAddMisconception,
  onResolveMisconception,
  renderPlannerAction,
}) {
  const [recallResponse, setRecallResponse] = useState("");
  const [practiceResponse, setPracticeResponse] = useState("");
  const [teachResponse, setTeachResponse] = useState("");
  const [proveResponse, setProveResponse] = useState("");
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [confidence, setConfidence] = useState(3);
  const [teachResult, setTeachResult] = useState(null);
  const [misconceptionDraft, setMisconceptionDraft] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const recognitionRef = useRef(null);
  const voiceCaptureSupported = Boolean(globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition);

  const learningNodes = useMemo(() => nodes.filter((node) => node.type !== "notebook"), [nodes]);
  const recommendedNode = useMemo(() => (
    reviewQueue[0]
    || learningNodes.find((node) => stateFor(progressByNodeId, node.id).status === "learning")
    || learningNodes.find((node) => stateFor(progressByNodeId, node.id).status !== "mastered")
    || learningNodes[0]
    || null
  ), [learningNodes, progressByNodeId, reviewQueue]);
  const currentNode = selectedNode?.type === "notebook" ? recommendedNode : selectedNode || recommendedNode;
  const currentProgress = stateFor(progressByNodeId, currentNode?.id);
  const topicNoteSaving = Boolean(currentNode && isSavingNote?.(currentNode));
  const coachNoteOverride = currentNode && coachState.response ? {
    title: `${currentNode.title} - AI Coach`,
    details: coachState.response,
  } : null;
  const coachNoteSaving = Boolean(coachNoteOverride && isSavingNote?.(currentNode, coachNoteOverride));
  const sessionMatches = activeSession?.nodeId === currentNode?.id && !activeSession?.completedAt && !activeSession?.pausedAt;
  const stageIndex = sessionMatches ? Math.max(0, Math.min(SESSION_STEPS.length - 1, Number(activeSession.stageIndex || 0))) : 0;
  const currentStep = SESSION_STEPS[stageIndex];
  const misconceptions = (Array.isArray(currentProgress.misconceptions)
    ? currentProgress.misconceptions
    : []).map((item, index) => (
    item && typeof item === "object"
      ? item
      : { id: `misconception-${index}`, label: String(item || "") }
  )).filter((item) => !item.resolvedAt && (item.label || item.text));

  useEffect(() => {
    setRecallResponse("");
    setPracticeResponse("");
    setTeachResponse("");
    setProveResponse("");
    setAnswerRevealed(false);
    setConfidence(3);
    setTeachResult(null);
    setVoiceError("");
  }, [activeSession?.id, currentNode?.id]);

  useEffect(() => {
    setAnswerRevealed(false);
  }, [activeSession?.id, stageIndex]);

  useEffect(() => () => recognitionRef.current?.stop?.(), []);

  const advance = (nextStageIndex = stageIndex + 1) => {
    onAdvanceSession?.({
      nodeId: currentNode?.id,
      sessionId: activeSession?.id,
      stageIndex: Math.min(nextStageIndex, SESSION_STEPS.length - 1),
    });
  };

  const recordAndAdvance = ({ kind, response, rating, score, nextStageIndex = stageIndex + 1 }) => {
    onRecordAttempt?.({
      nodeId: currentNode?.id,
      kind,
      response,
      rating,
      confidence,
      score,
      nextStageIndex,
      correct: rating === "good" || rating === "easy" || Number(score) >= 60,
    });
  };

  const updateTeachResponse = (value) => {
    setTeachResponse(value);
    setTeachResult(null);
  };

  const toggleVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice input is unavailable in this browser. Type your explanation instead.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || "").join(" ");
      updateTeachResponse(transcript.trim());
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      setVoiceError("Voice input stopped. You can continue by typing your explanation.");
    };
    recognitionRef.current = recognition;
    setVoiceError("");
    setIsListening(true);
    recognition.start();
  };

  if (!currentNode) {
    return <div className="learning-studio-empty">Add a chapter or topic to begin a guided study session.</div>;
  }

  const renderStage = () => {
    if (!sessionMatches) {
      return (
        <div className="learning-studio-welcome">
          <span className="learning-studio-welcome__icon"><Play aria-hidden="true" size={24} /></span>
          <span className="section-tag">Recommended next</span>
          <h3>{currentNode.title}</h3>
          <p>{currentNode.summary || currentNode.explanation || `Build a working understanding of ${currentNode.title}, then prove it with active recall.`}</p>
          <div className="learning-studio-welcome__facts">
            <span><Clock3 size={14} /> 15-20 minutes</span>
            <span><Target size={14} /> 5 active stages</span>
            <span><Gauge size={14} /> {STATUS_LABELS[currentProgress.status] || "New"}</span>
          </div>
          <button className="learning-studio-primary" onClick={() => onStartSession?.(currentNode.id)} type="button">
            <Play size={16} /> Start focused session
          </button>
        </div>
      );
    }

    if (currentStep.id === "learn") {
      return (
        <div className="learning-studio-stage">
          <span className="section-tag">Understand</span>
          <h3>{currentNode.title}</h3>
          <div className="learning-studio-explanation">
            {(currentNode.explanation || currentNode.summary || nodeAnswer(currentNode)).split(/\n{2,}/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
          {cleanLines(currentNode.keyPoints).length ? (
            <div className="learning-studio-keypoints">
              {cleanLines(currentNode.keyPoints).map((point, index) => <span key={point}><b>{index + 1}</b>{point}</span>)}
            </div>
          ) : null}
          <button className="learning-studio-primary" onClick={() => advance()} type="button">I understand — start Recall <ArrowRight size={16} /></button>
        </div>
      );
    }

    if (currentStep.id === "recall") {
      return (
        <div className="learning-studio-stage">
          <span className="section-tag">Active recall</span>
          <h3>Without looking back, explain {currentNode.title}</h3>
          <p>Writing from memory makes gaps visible. A short answer is enough.</p>
          <textarea
            aria-label={`Your recalled answer for ${currentNode.title}`}
            onChange={(event) => setRecallResponse(event.target.value)}
            placeholder="Write what you remember before viewing the reference answer..."
            rows={7}
            value={recallResponse}
          />
          {!answerRevealed ? (
            <button className="learning-studio-primary" disabled={!recallResponse.trim()} onClick={() => setAnswerRevealed(true)} type="button">Reveal and compare</button>
          ) : (
            <div className="learning-studio-reveal">
              <strong>Reference answer</strong>
              <p>{nodeAnswer(currentNode)}</p>
              <span>How close was your answer? Choose one to save Recall and continue to Practice.</span>
              <SelfRatingButtons onRate={(rating) => recordAndAdvance({
                kind: "recall",
                response: recallResponse,
                rating,
              })} />
            </div>
          )}
        </div>
      );
    }

    if (currentStep.id === "practice") {
      return (
        <div className="learning-studio-stage">
          <span className="section-tag">Apply</span>
          <h3>Use {currentNode.title} in a short scenario</h3>
          <p>Write your reasoning, then rate how confident you feel about the response.</p>
          <StudyLab node={currentNode} onResponseChange={setPracticeResponse} response={practiceResponse} />
          <div className="learning-studio-confidence">
            <label htmlFor="learning-practice-confidence">Your confidence</label>
            <input id="learning-practice-confidence" max="5" min="1" onChange={(event) => setConfidence(Number(event.target.value))} type="range" value={confidence} />
            <strong>{confidence}/5</strong>
          </div>
          <button className="learning-studio-primary" disabled={!practiceResponse.trim()} onClick={() => recordAndAdvance({ kind: "practice", response: practiceResponse, rating: confidence >= 4 ? "good" : "hard" })} type="button">Save Practice — start Teach back <ArrowRight size={16} /></button>
        </div>
      );
    }

    if (currentStep.id === "teach") {
      return (
        <div className="learning-studio-stage">
          <span className="section-tag">Teach back</span>
          <h3>Teach {currentNode.title} to a beginner</h3>
          <p>Explain what it is, why it matters, and one example — using your own words.</p>
          <div className="learning-studio-voice-field">
            <textarea
              aria-label={`Your beginner-friendly explanation of ${currentNode.title}`}
              onChange={(event) => updateTeachResponse(event.target.value)}
              placeholder="Imagine a beginner asked: What does this mean, why does it matter, and where is it used?"
              rows={8}
              value={teachResponse}
            />
            <button aria-label={isListening ? "Stop voice capture" : "Explain with voice"} className={isListening ? "is-listening" : ""} disabled={!voiceCaptureSupported} onClick={toggleVoice} title={voiceCaptureSupported ? "Explain with voice" : "Voice capture is not supported in this browser"} type="button">
              {isListening ? <Square size={15} /> : <Mic size={16} />}
            </button>
          </div>
          {voiceError || !voiceCaptureSupported ? (
            <small className="learning-studio-voice-message" role={voiceError ? "alert" : undefined}>
              {voiceError || "Voice input is unavailable in this browser. Type your explanation instead."}
            </small>
          ) : null}
          {!teachResult ? (
            <button
              className="learning-studio-primary"
              disabled={teachResponse.trim().length < 20}
              onClick={() => setTeachResult(teachBackResult(currentNode, teachResponse))}
              type="button"
            >Check my explanation</button>
          ) : (
            <div className={`learning-studio-teach-score${teachResult.score >= 60 ? " is-strong" : " is-gap"}`}>
              <strong>{teachResult.score}% concept coverage</strong>
              <p>{teachResult.score >= 60 ? "Your explanation covers the central ideas." : "Your explanation has useful foundations, but a few links need another pass."}</p>
              {teachResult.missing.length ? <small>Consider adding: {teachResult.missing.join(", ")}</small> : null}
              <small>Edit your explanation above if you want to check it again.</small>
              <button onClick={() => recordAndAdvance({ kind: "teach_back", response: teachResponse, score: teachResult.score, rating: teachResult.score >= 75 ? "good" : "hard" })} type="button">Save Teach back — start Prove <ArrowRight size={15} /></button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="learning-studio-stage">
        <span className="section-tag">Mastery checkpoint</span>
        <h3>Can you retrieve the concept without help?</h3>
        <div className="learning-studio-proof-card">
          <FileQuestion size={24} />
          <strong>State the central idea of {currentNode.title}, then give one valid application.</strong>
          <p>Write an unaided answer below. This response is saved as your final evidence.</p>
        </div>
        <textarea
          aria-label={`Your final mastery answer for ${currentNode.title}`}
          onChange={(event) => setProveResponse(event.target.value)}
          placeholder="Central idea... One valid application..."
          readOnly={answerRevealed}
          rows={6}
          value={proveResponse}
        />
        {!answerRevealed ? (
          <button className="learning-studio-primary" disabled={!proveResponse.trim()} onClick={() => setAnswerRevealed(true)} type="button">Reveal and compare</button>
        ) : (
          <div className="learning-studio-reveal">
            <strong>Reference</strong>
            <p>{nodeAnswer(currentNode)}</p>
            <span>How well did you answer without help? Your choice saves the session and schedules review.</span>
            <SelfRatingButtons onRate={(rating) => onFinishSession?.({
              nodeId: currentNode.id,
              sessionId: activeSession?.id,
              rating,
              response: proveResponse,
            })} />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="learning-studio">
      <header className="learning-studio-sessionbar">
        <div>
          <span><BrainCircuit size={15} /> Adaptive session</span>
          <strong>{sessionMatches ? currentNode.title : `Continue ${notebook?.subjectName || "learning"}`}</strong>
        </div>
        <div className="learning-studio-sessionbar__metrics">
          <span><CalendarClock size={14} /> {reviewQueue.length} due</span>
          <span><Clock3 size={14} /> {sessionMatches ? "In progress" : "15-20 min"}</span>
          {sessionMatches ? <button aria-label="Pause session" onClick={() => onPauseSession?.(activeSession)} title="Pause and save session" type="button"><Pause size={15} /></button> : null}
        </div>
      </header>

      <div className="learning-studio-layout">
        <aside className="learning-studio-outline" aria-label="Course mastery outline">
          <div className="learning-studio-panel-heading">
            <div><span>Course path</span><strong>{learningNodes.length} units</strong></div>
            <button aria-label="Open mastery map" onClick={onOpenMap} title="Open mastery map" type="button"><MapIcon size={16} /></button>
          </div>
          <div className="learning-studio-outline__list">
            {(notebook?.chapters || []).map((chapter) => (
              <section key={chapter.id}>
                <button className={chapter.id === currentNode.id ? "is-active" : ""} onClick={() => onSelectNode?.(chapter.id)} type="button">
                  <span className={`is-${stateFor(progressByNodeId, chapter.id).status || "new"}`} />
                  <strong>{chapter.title}</strong>
                  <ChevronRight size={14} />
                </button>
                {(chapter.topics || []).map((topic) => (
                  <button className={topic.id === currentNode.id ? "is-active is-topic" : "is-topic"} key={topic.id} onClick={() => onSelectNode?.(topic.id)} type="button">
                    <span className={`is-${stateFor(progressByNodeId, topic.id).status || "new"}`} />
                    <strong>{topic.title}</strong>
                    <small>{STATUS_LABELS[stateFor(progressByNodeId, topic.id).status] || "New"}</small>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <main className="learning-studio-canvas">
          {sessionMatches ? (
            <div className="learning-studio-stepper" aria-label="Session progress">
              {SESSION_STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div aria-current={index === stageIndex ? "step" : undefined} className={index < stageIndex ? "is-done" : index === stageIndex ? "is-active" : ""} key={step.id} title={step.description}>
                    <span>{index < stageIndex ? <Check size={13} /> : <Icon size={13} />}</span>
                    <small>{step.label}</small>
                  </div>
                );
              })}
            </div>
          ) : null}
          {sessionMatches ? (
            <div className="learning-studio-stage-guide" role="status">
              <strong>Step {stageIndex + 1} of {SESSION_STEPS.length}: {currentStep.label}</strong>
              <span>{currentStep.description}</span>
            </div>
          ) : null}
          {renderStage()}
          <div className="learning-studio-actiondock" aria-label="Learning actions">
            <button onClick={() => onReferMaterial?.(currentNode)} type="button"><BookOpenCheck size={15} /> Refer material</button>
            <button disabled={topicNoteSaving} onClick={() => onSaveToNotes?.(currentNode)} type="button"><NotebookPen size={15} /> {topicNoteSaving ? "Saving..." : "Save to notes"}</button>
            {renderPlannerAction?.(currentNode)}
          </div>
          {latestReceipt?.nodeId === currentNode.id ? (
            <section className="learning-studio-receipt" aria-live="polite">
              <span><Trophy size={20} /></span>
              <div>
                <small>Session complete</small>
                <strong>{latestReceipt.title || currentNode.title}</strong>
                <p>{latestReceipt.summary || "Your attempt was saved, planner progress was synchronized, and the next review was scheduled."}</p>
              </div>
              <b>{latestReceipt.masteryScore ?? currentProgress.masteryScore ?? 0}%</b>
            </section>
          ) : null}
        </main>

        <aside className="learning-studio-coach" aria-label="Contextual AI learning coach">
          <div className="learning-studio-coach__controls">
            <div className="learning-studio-coach__heading">
              <span><Sparkles size={17} /></span>
              <div>
                <strong>AI Coach</strong>
                <small>Focused guidance for this learning stage</small>
              </div>
            </div>
            <div className="learning-studio-coach__actions">
              {COACH_ACTIONS.map((action) => {
                const Icon = action.icon;
                return <button disabled={coachState.loading} key={action.id} onClick={() => onCoachAction?.(action.id, currentNode)} type="button"><Icon size={14} />{action.label}</button>;
              })}
            </div>
          </div>
          <div className="learning-studio-coach__body">
            {coachState.loading ? <div className="learning-studio-coach__thinking"><BrainCircuit className="spinner" size={17} /> Coach is preparing focused guidance...</div> : null}
            {coachState.error ? <p className="learning-studio-coach__error"><CircleAlert size={14} />{coachState.error}</p> : null}
            {coachState.response ? (
              <div className="learning-studio-coach__response">
                <span>{coachState.label || "Coach guidance"}</span>
                <div className="learning-studio-coach__response-copy">
                  {String(coachState.response).split(/\n{2,}/).filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
                <button disabled={coachNoteSaving} onClick={() => onSaveToNotes?.(currentNode, coachNoteOverride)} type="button"><NotebookPen size={14} /> {coachNoteSaving ? "Saving..." : "Save guidance"}</button>
              </div>
            ) : (
              <p className="learning-studio-coach__empty">Choose a focused action. The coach receives this concept and your current learning stage-not a blank chat.</p>
            )}
          </div>
        </aside>

        <section className="learning-studio-misconceptions" aria-label="Misconception radar">
          <div className="learning-studio-misconceptions__controls">
            <div className="learning-studio-misconceptions__heading">
              <div><strong>Misconception radar</strong><span>{misconceptions.length}</span></div>
              <small>Keep uncertain ideas visible until they are resolved.</small>
            </div>
            <form onSubmit={(event) => {
              event.preventDefault();
              if (!misconceptionDraft.trim()) return;
              onAddMisconception?.(currentNode.id, misconceptionDraft.trim());
              setMisconceptionDraft("");
            }}>
              <input aria-label="Add a misconception" onChange={(event) => setMisconceptionDraft(event.target.value)} placeholder="What still feels unclear?" value={misconceptionDraft} />
              <button aria-label="Add misconception" disabled={!misconceptionDraft.trim()} title="Add misconception" type="submit"><Check size={22} strokeWidth={2.7} /></button>
            </form>
          </div>
          <div
            aria-label={misconceptions.length
              ? "Saved misconceptions. Scroll horizontally to review all cards."
              : "Saved misconceptions"}
            className="learning-studio-misconceptions__rail"
            role={misconceptions.length ? "region" : undefined}
            tabIndex={misconceptions.length ? 0 : undefined}
          >
            {misconceptions.length ? (
              <div className="learning-studio-misconceptions__list" role="list">
                {misconceptions.map((item) => (
                  <article key={item.id || item.text} role="listitem">
                    <CircleAlert aria-hidden="true" size={18} />
                    <p title={item.text || item.label}>{item.text || item.label}</p>
                    <button aria-label={`Resolve ${item.text || item.label}`} onClick={() => onResolveMisconception?.(currentNode.id, item.id)} title="Mark resolved" type="button"><X size={17} /></button>
                  </article>
                ))}
              </div>
            ) : <small>No recurring gaps recorded for this concept.</small>}
          </div>
        </section>
      </div>
    </div>
  );
}

export default LearningStudyStudio;
