import { Check, CalendarPlus, Save, Target } from "lucide-react";
import { getRevisedNoteTopicIds } from "../utils/learningRevisedNoteActions.js";

function Paragraphs({ text }) {
  return String(text || "").split(/\n+/u).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>);
}

function Points({ title, values }) {
  if (!values?.length) return null;
  return <section className="notebook-content-points"><h4>{title}</h4><ul>{values.map((value, index) => <li key={index}>{value}</li>)}</ul></section>;
}

export default function NotebookContent({ notebook, completionByTopic, onComplete, onPlanner, onSave, onRecall, isSaving }) {
  const topics = (notebook.chapters || []).flatMap((chapter) => (chapter.topics || []).map((topic) => ({ ...topic, chapterName: chapter.title, subjectName: notebook.subjectName, type: "topic" })));
  const savedNotes = (notebook.revisedNotes || []).map((note) => ({ note, topicIds: getRevisedNoteTopicIds(note, notebook) }));
  const standaloneNotes = savedNotes.filter(({ topicIds }) => topicIds.length !== 1);
  return <div className="notebook-content-topics">
    {topics.map((topic, index) => {
      const complete = completionByTopic?.[topic.id] === true;
      const legacyNotes = topic.explanation?.trim() ? [] : savedNotes.filter(({ topicIds }) => topicIds.length === 1 && topicIds[0] === topic.id).map(({ note }) => note);
      const explanation = topic.explanation?.trim() || legacyNotes.map((note) => note.content).filter(Boolean).join("\n\n") || topic.summary;
      const keyPoints = [...new Set([...(topic.keyPoints || []), ...legacyNotes.flatMap((note) => note.keyPoints || [])])];
      const revisionTips = [...new Set([...(topic.revisionTips || []), ...legacyNotes.flatMap((note) => note.revisionTips || [])])];
      return <article className={`notebook-content-topic${complete ? " is-complete" : ""}`} key={topic.id}>
        <header><span>{String(index + 1).padStart(2, "0")}</span><div><small>{topic.chapterName !== topic.title ? topic.chapterName : notebook.subjectName}</small><h3>{topic.title}</h3></div><button aria-pressed={complete} className={complete ? "is-complete" : ""} onClick={() => onComplete(topic, !complete)} type="button"><Check size={15} />{complete ? "Completed" : "Mark completed"}</button></header>
        <Paragraphs text={explanation} />
        <Points title="Key points" values={keyPoints} />
        {topic.examples?.length > 0 && <section className="notebook-content-examples"><h4>Explained examples</h4>{topic.examples.map((example, exampleIndex) => <div key={exampleIndex}><Paragraphs text={example} /></div>)}</section>}
        {(topic.subtopics || []).map((subtopic) => <section className="notebook-content-subtopic" key={subtopic.id}><h4>{subtopic.title}</h4><Paragraphs text={subtopic.explanation || subtopic.summary} /><Points title="Remember" values={subtopic.keyPoints} />{subtopic.examples?.map((example, i) => <Paragraphs key={i} text={example} />)}</section>)}
        <Points title="In practice" values={topic.applications} />
        <Points title="Common mistakes" values={topic.commonMistakes} />
        <Points title="Revision cues" values={revisionTips} />
        <footer><button onClick={() => onRecall(topic)} type="button"><Target size={15} />Recall</button><button onClick={() => onPlanner(topic)} type="button"><CalendarPlus size={15} />Add to planner</button><button disabled={isSaving(topic)} onClick={() => onSave(topic)} type="button"><Save size={15} />{isSaving(topic) ? "Saving…" : "Save to Notes"}</button></footer>
      </article>;
    })}
    {!topics.length && <p className="learning-section-empty">No topic content is available for this notebook.</p>}
    {standaloneNotes.length > 0 && <section className="notebook-content-questions"><h3>Saved notes</h3>{standaloneNotes.map(({ note }, index) => <article key={note.id || index}><h4>{note.title || "Study notes"}</h4><Paragraphs text={note.content} /><Points title="Key points" values={note.keyPoints} /><Points title="Revision cues" values={note.revisionTips} /></article>)}</section>}
    {notebook.importantQuestions?.length > 0 && <section className="notebook-content-questions"><h3>Practice with explanations</h3>{notebook.importantQuestions.map((question) => <article key={question.id}><h4>{question.question}</h4><Paragraphs text={question.answer} /></article>)}</section>}
  </div>;
}
