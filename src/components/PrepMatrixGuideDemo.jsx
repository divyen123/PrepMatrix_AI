import { useEffect, useReducer } from "react";
import {
  ArrowRight,
  BarChart3,
  Bookmark,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  FolderOpen,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Video,
} from "lucide-react";
import { createGuideDemoState, guideDemoReducer } from "./prepMatrixGuideDemoState";
import "./PrepMatrixGuideDemo.css";

function DemoAction({ children, secondary = false, ...props }) {
  return <button className={`guide-demo-action${secondary ? " is-secondary" : ""}`} type="button" {...props}>{children}</button>;
}

function DemoMeter({ value, label }) {
  return (
    <div aria-label={label} aria-valuemax={100} aria-valuemin={0} aria-valuenow={value} className="guide-demo-meter" role="progressbar">
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

function GuideDemoPreview({ stepId, examples, profileLabel }) {
  const [state, dispatch] = useReducer(guideDemoReducer, null, () => createGuideDemoState(stepId, examples));
  const subject = examples.subject || "Your subject";
  const chapter = examples.chapter || "Foundations";
  const topic = examples.topic || "Key concepts";
  const chapters = [chapter, ...(examples.additionalChapters || ["Practice", "Revision"])].slice(0, 3);
  while (chapters.length < 3) chapters.push(chapters.length === 1 ? "Practice" : "Revision");
  const interact = (changes) => dispatch({ type: "interact", changes });

  useEffect(() => {
    if (!state.playing) return undefined;
    const timer = window.setTimeout(() => dispatch({ type: "advance", examples }), 2000);
    return () => window.clearTimeout(timer);
  }, [state.playing, state.phase, examples]);

  const renderScene = () => {
    switch (stepId) {
      case "profile": {
        const contextDetails = {
          Subjects: [subject, "Build a subject list that matches your syllabus."],
          Materials: [`${chapter} resources`, "Find learning resources for your curriculum."],
          AI: [topic, "Get explanations with your learning context."],
        };
        const detail = contextDetails[state.contextTarget];
        return (
          <div className="guide-demo-scene guide-demo-profile">
            <div className="guide-demo-scene-heading"><Settings aria-hidden="true" size={18} /><strong>Settings · Profile & Information</strong></div>
            <div className="guide-demo-profile-context"><span className="guide-demo-avatar"><BrainCircuit aria-hidden="true" size={25} /></span><div><small>Your learning context</small><strong>{profileLabel || examples.contextLabel || "Your current academic profile"}</strong></div></div>
            <p className="guide-demo-prompt">Tap a destination to see where your profile helps.</p>
            <div className="guide-demo-choices">
              {["Subjects", "Materials", "AI"].map((target) => (
                <button aria-pressed={state.contextTarget === target} className={`guide-demo-choice${state.contextTarget === target ? " is-active" : ""}`} key={target} onClick={() => interact({ contextTarget: target, feedback: `Your learning profile gives ${target} relevant study context.` })} type="button">{target}<ArrowRight aria-hidden="true" size={14} /></button>
              ))}
            </div>
            <div className={`guide-demo-preview-card${detail ? " is-complete" : ""}`}>
              <Sparkles aria-hidden="true" size={20} /><div><strong>{detail ? detail[0] : "One context, connected tools"}</strong><p>{detail ? detail[1] : "Subjects, materials, and AI use your current profile."}</p></div>
            </div>
          </div>
        );
      }
      case "subjects": {
        const valid = state.subjectName.trim() && Number.isInteger(Number(state.chapters)) && Number(state.chapters) > 0 && Number(state.chapters) <= 1000;
        return (
          <div className="guide-demo-scene guide-demo-subjects">
            <div className="guide-demo-scene-heading"><BookOpen aria-hidden="true" size={18} /><strong>Add a subject</strong><small>Try one sample entry</small></div>
            <div className="guide-demo-workspace">
              <div className="guide-demo-form">
                <label className="guide-demo-field">Subject name<input onChange={(event) => interact({ subjectName: event.target.value, subjectAdded: false, feedback: "Use the subject name from your syllabus." })} placeholder={subject} value={state.subjectName} /></label>
                <div className="guide-demo-field-row">
                  <label className="guide-demo-field">Chapters<input max="1000" min="1" onChange={(event) => interact({ chapters: event.target.value, subjectAdded: false })} step="1" type="number" value={state.chapters} /></label>
                  <label className="guide-demo-field">Difficulty<select onChange={(event) => interact({ difficulty: event.target.value, subjectAdded: false })} value={state.difficulty}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
                </div>
                <DemoAction disabled={!valid} onClick={() => interact({ subjectAdded: true, feedback: "Subject added to this preview library." })}><Plus aria-hidden="true" size={15} />Add to preview</DemoAction>
              </div>
              <div className="guide-demo-result">
                <small>Subject library</small>
                <div className={`guide-demo-preview-card${state.subjectAdded ? " is-complete" : " guide-demo-placeholder"}`}>
                  {state.subjectAdded ? <><CheckCircle2 aria-hidden="true" size={21} /><div><strong>{state.subjectName.trim()}</strong><p>{state.chapters} chapters · {state.difficulty}</p><span className="guide-demo-caption">Ready for your schedule</span></div></> : <><BookOpen aria-hidden="true" size={24} /><p>Your subject will appear here.</p></>}
                </div>
              </div>
            </div>
          </div>
        );
      }
      case "plan": {
        const priorityOrder = state.strategy === "priority" ? [chapters[1], chapters[0], chapters[2]] : chapters;
        const planTasks = state.strategy === "revision"
          ? [`Review ${chapters[0]}`, `Recall ${chapters[1]}`, "Practice & revise"]
          : state.strategy === "rapid"
            ? ["Cover key concepts", "Practise essentials", "Quick recap"]
            : priorityOrder;
        return (
          <div className="guide-demo-scene guide-demo-plan">
            <div className="guide-demo-scene-heading"><CalendarDays aria-hidden="true" size={18} /><strong>Build your schedule</strong><small>{subject}</small></div>
            <div className="guide-demo-field-row">
              <label className="guide-demo-field">Exam date<input onChange={(event) => interact({ examDate: event.target.value, generated: false })} type="date" value={state.examDate} /></label>
              <label className="guide-demo-field">Strategy<select onChange={(event) => interact({ strategy: event.target.value, generated: false, feedback: "Choose how the study days should be balanced." })} value={state.strategy}><option value="balanced">Balanced coverage</option><option value="priority">High priority first</option><option value="revision">Revision-heavy</option><option value="rapid">Rapid coverage</option></select></label>
            </div>
            <DemoAction disabled={!state.examDate} onClick={() => interact({ generated: true, feedback: "Your subjects become daily tasks. Here are three sample days." })}><Sparkles aria-hidden="true" size={15} />Generate preview</DemoAction>
            <div className="guide-demo-timeline">
              {planTasks.map((task, index) => <div className="guide-demo-day" data-active={state.generated} key={index}><small>Day {index + 1}</small><span className={`guide-demo-task-chip${state.generated ? " is-complete" : ""}`}>{state.generated ? task : "Study slot"}</span>{state.generated && <span className="guide-demo-caption">{index === 2 ? "Review & practise" : "Learn & recall"}</span>}</div>)}
            </div>
            <span className="guide-demo-caption">A simplified preview of the first three days.</span>
          </div>
        );
      }
      case "learn":
        return (
          <div className="guide-demo-scene guide-demo-learn">
            <div className="guide-demo-scene-heading"><BrainCircuit aria-hidden="true" size={18} /><strong>From source to understanding</strong></div>
            <div className="guide-demo-workspace">
              <div className="guide-demo-form">
                <div className={`guide-demo-preview-card${state.sourceAdded ? " is-complete" : ""}`}><FileText aria-hidden="true" size={25} /><div><strong>{subject}</strong><p>{chapter}</p><small>Example chapter source</small></div></div>
                <DemoAction disabled={state.sourceAdded} onClick={() => interact({ sourceAdded: true, feedback: "Begin with a study source or chapter names." })}>{state.sourceAdded ? <Check aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={15} />}{state.sourceAdded ? "Source ready" : "Use example source"}</DemoAction>
                <DemoAction disabled={!state.sourceAdded || state.outlineReady} secondary onClick={() => interact({ outlineReady: true, feedback: "The source becomes a notebook with connected topics." })}><Layers aria-hidden="true" size={15} />Build preview outline</DemoAction>
              </div>
              <div className="guide-demo-result"><small>Notebook outline</small>
                <div className={`guide-demo-outline${state.outlineReady ? " is-active" : ""}`}>
                  <strong>{state.outlineReady ? chapter : "Your chapter"}</strong>
                  <button aria-pressed={state.learned} className={`guide-demo-topic${state.learned ? " is-complete" : ""}`} disabled={!state.scheduled} onClick={() => interact({ learned: !state.learned, feedback: state.learned ? "Topic marked for more practice in this preview." : "Scheduled topic completed. Your progress now reflects it." })} type="button"><span className="guide-demo-checkbox">{state.learned ? <Check aria-hidden="true" size={14} /> : <BookOpen aria-hidden="true" size={14} />}</span><span>{state.outlineReady ? topic : "Connected topic"}<small>{state.learned ? "Completed" : "Mark as completed"}</small></span></button>
                  <div className="guide-demo-topic"><BrainCircuit aria-hidden="true" size={15} /><span>{state.outlineReady ? "Recall & explain" : "Revision question"}</span></div>
                </div>
                <DemoAction disabled={!state.outlineReady || state.scheduled} onClick={() => interact({ scheduled: true, feedback: "Topic added to the example plan. You can now mark it completed." })} secondary><CalendarDays aria-hidden="true" size={15} />{state.scheduled ? "In example plan" : "Add to planner"}</DemoAction>
              </div>
            </div>
          </div>
        );
      case "follow": {
        const done = state.completed.filter(Boolean).length;
        return (
          <div className="guide-demo-scene guide-demo-tasks">
            <div className="guide-demo-scene-heading"><CheckCircle2 aria-hidden="true" size={18} /><strong>Your daily checklist</strong><small>{done} / 3 complete</small></div>
            <DemoMeter label="Sample task completion" value={Math.round(done / 3 * 100)} />
            <div className="guide-demo-list">
              {[`Review ${chapter}`, `Practise ${topic}`, "Quick recap"].map((task, index) => <button aria-pressed={state.completed[index]} className={`guide-demo-task${state.completed[index] ? " is-complete" : ""}`} key={task} onClick={() => { const completed = [...state.completed]; completed[index] = !completed[index]; interact({ completed, feedback: completed[index] ? "Task complete. Your progress has updated." : "Task reopened for more study." }); }} type="button"><span className="guide-demo-checkbox">{state.completed[index] && <Check aria-hidden="true" size={14} />}</span><span>{task}</span><small>{index === 0 && !state.completed[0] ? state.recovered ? "Tomorrow" : "Missed yesterday" : state.completed[index] ? "Done" : "Today"}</small></button>)}
            </div>
            <DemoAction disabled={state.recovered || state.completed[0]} onClick={() => interact({ recovered: true, feedback: "Recovery moves unfinished work to a later study day." })} secondary><RotateCcw aria-hidden="true" size={15} />{state.recovered ? "Moved to tomorrow" : "Recover backlog"}</DemoAction>
          </div>
        );
      }
      case "revise":
        return (
          <div className="guide-demo-scene guide-demo-revise">
            <div className="guide-demo-scene-heading"><BookOpen aria-hidden="true" size={18} /><strong>One revision loop</strong><small>Note → practise → revisit</small></div>
            <div aria-label="Revision tools" className="guide-demo-tabs">
              {["notes", "quiz", "materials"].map((tab) => <button aria-pressed={state.revisionTab === tab} className={`guide-demo-choice${state.revisionTab === tab ? " is-active" : ""}`} key={tab} onClick={() => interact({ revisionTab: tab, feedback: `Try the ${tab} preview.` })} type="button">{tab === "notes" ? <FileText aria-hidden="true" size={15} /> : tab === "quiz" ? <CheckCircle2 aria-hidden="true" size={15} /> : <FolderOpen aria-hidden="true" size={15} />}{tab[0].toUpperCase() + tab.slice(1)}</button>)}
            </div>
            <div className="guide-demo-revision-panel" data-tool={state.revisionTab}>
              {state.revisionTab === "notes" && <><label className="guide-demo-field">A note for your next revision<textarea onChange={(event) => interact({ note: event.target.value, noteSaved: false })} rows={3} value={state.note} /></label><DemoAction disabled={!state.note.trim()} onClick={() => interact({ noteSaved: true, feedback: "Note saved in this preview. Use Notes for your own revision queue." })}>{state.noteSaved ? <Check aria-hidden="true" size={15} /> : <Plus aria-hidden="true" size={15} />}{state.noteSaved ? "Saved in preview" : "Save preview note"}</DemoAction></>}
              {state.revisionTab === "quiz" && <><p className="guide-demo-question">How should you use a quiz result?</p><div className="guide-demo-answer-list">{[["revisit", "Revisit the topics I missed"], ["repeat", "Repeat every chapter equally"]].map(([answer, label]) => <button aria-pressed={state.answer === answer} className={`guide-demo-choice${state.answer === answer ? " is-active" : ""}`} key={answer} onClick={() => interact({ answer, feedback: answer === "revisit" ? "Exactly. Focus your revision on the gaps a quiz reveals." : "Start with missed topics to focus your next revision session." })} type="button">{state.answer === answer && <Check aria-hidden="true" size={15} />}{label}</button>)}</div>{state.answer && <p className="guide-demo-inline-feedback">{state.answer === "revisit" ? "Focus on the gaps, then quiz again." : "Let the missed questions guide your revision."}</p>}</>}
              {state.revisionTab === "materials" && <><div className="guide-demo-choices">{["Video", "Article"].map((type) => <button aria-pressed={state.resourceType === type} className={`guide-demo-choice${state.resourceType === type ? " is-active" : ""}`} key={type} onClick={() => interact({ resourceType: type, bookmarked: false })} type="button">{type}</button>)}</div><div className="guide-demo-preview-card">{state.resourceType === "Video" ? <Video aria-hidden="true" size={24} /> : <FileText aria-hidden="true" size={24} />}<div><strong>{topic}</strong><p>{state.resourceType} resource · example</p></div></div><DemoAction onClick={() => interact({ bookmarked: !state.bookmarked, feedback: state.bookmarked ? "Bookmark removed from this preview." : "Resource bookmarked in this preview for your next revision." })}><Bookmark aria-hidden="true" size={15} />{state.bookmarked ? "Bookmarked" : "Bookmark preview"}</DemoAction></>}
            </div>
          </div>
        );
      case "review": {
        const percentages = [80, 55, 25];
        const suggestions = ["Recall the key ideas, then move on.", "Practise one more example.", "Give this chapter your next study session."];
        return (
          <div className="guide-demo-scene guide-demo-progress">
            <div className="guide-demo-scene-heading"><BarChart3 aria-hidden="true" size={18} /><strong>{subject}</strong><small>Example progress</small></div>
            <p className="guide-demo-prompt">Select a chapter to find your next focus.</p>
            <div className="guide-demo-bars">{chapters.map((name, index) => <button aria-pressed={state.selectedLane === index} className={`guide-demo-bar${state.selectedLane === index ? " is-active" : ""}`} key={`${name}-${index}`} onClick={() => interact({ selectedLane: index, feedback: suggestions[index] })} type="button"><span>{name}</span><strong>{percentages[index]}%</strong><span aria-hidden="true" className="guide-demo-meter"><span style={{ width: `${percentages[index]}%` }} /></span></button>)}</div>
            <div className={`guide-demo-preview-card${state.selectedLane >= 0 ? " is-complete" : ""}`}><ArrowRight aria-hidden="true" size={20} /><div><small>Next focus</small><strong>{chapters[state.selectedLane] || "Choose a chapter"}</strong><p>{suggestions[state.selectedLane] || "Find a useful focus for your next study session."}</p></div></div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <section aria-label="Interactive guide preview" className="guide-demo" data-step={stepId}>
      <div className="guide-demo-toolbar">
        <span className="guide-demo-label"><Sparkles aria-hidden="true" size={15} />Practice preview</span>
        <div className="guide-demo-transport">
          <button className="guide-demo-control" onClick={() => dispatch({ type: state.playing ? "pause" : "watch", examples })} type="button">{state.playing ? <Pause aria-hidden="true" size={14} /> : <Play aria-hidden="true" size={14} />}{state.playing ? "Pause" : state.phase > 0 && state.phase < 3 ? "Resume demo" : "Watch demo"}</button>
          <button aria-label="Replay demo" className="guide-demo-control" onClick={() => dispatch({ type: "replay", examples })} title="Replay demo" type="button"><RotateCcw aria-hidden="true" size={14} /><span>Replay</span></button>
        </div>
      </div>
      <div aria-label="Demo playback" aria-valuemax={3} aria-valuemin={0} aria-valuenow={state.phase} className="guide-demo-phases" role="progressbar">{[1, 2, 3].map((phase) => <span data-active={state.playing && phase === state.phase + 1} data-complete={state.phase >= phase} key={phase} />)}</div>
      <div className="guide-demo-stage">{renderScene()}</div>
      <div aria-live="polite" className="guide-demo-feedback" role="status"><span aria-hidden="true"><CheckCircle2 size={15} /></span>{state.feedback}</div>
      <p className="guide-demo-note">Practice only · Your account, data, and credits stay unchanged.</p>
    </section>
  );
}

export default function PrepMatrixGuideDemo({ stepId, examples = {}, profileLabel = "" }) {
  return <GuideDemoPreview examples={examples} key={stepId} profileLabel={profileLabel} stepId={stepId} />;
}
