import { Check, ChevronRight, LockKeyhole, Sparkles } from "lucide-react";
import {
  KIDS_SUBJECTS,
  SUBJECTS_BY_AGE_BAND,
  getKidsCopy,
  getLocalized,
} from "../../utils/kidsLearning";

export default function KidsAdventureMap({
  ageBand,
  language = "en",
  progress,
  selectedSubject,
  onSelectSubject,
}) {
  const copy = getKidsCopy(language);
  const subjectIds = SUBJECTS_BY_AGE_BAND[ageBand] || SUBJECTS_BY_AGE_BAND["class1-2"];

  return (
    <section aria-labelledby="kids-adventure-heading" className="kids-map-card">
      <div className="kids-section-heading">
        <span aria-hidden="true" className="kids-heading-icon">🗺️</span>
        <div>
          <span className="kids-eyebrow">{copy.adventureMap}</span>
          <h2 id="kids-adventure-heading">{copy.pickWorld}</h2>
        </div>
      </div>

      <div className="kids-adventure-map">
        <span aria-hidden="true" className="kids-map-trail" />
        {subjectIds.map((subjectId, index) => {
          const subject = KIDS_SUBJECTS[subjectId];
          const mastery = Math.max(0, Math.min(100, Number(progress?.mastery?.[subjectId]?.percentage) || 0));
          const complete = mastery >= 80;
          const isSelected = selectedSubject === subjectId;
          return (
            <button
              aria-label={`${getLocalized(subject, language, "world")}, ${mastery}% ${copy.mastery}`}
              aria-pressed={isSelected}
              className={`kids-world-node${isSelected ? " is-selected" : ""}${complete ? " is-mastered" : ""}`}
              key={subjectId}
              onClick={() => onSelectSubject(subjectId)}
              style={{
                "--kids-world-color": subject.color,
                "--kids-world-soft": subject.softColor,
                "--kids-node-order": index,
              }}
              type="button"
            >
              <span aria-hidden="true" className="kids-world-number">{complete ? <Check size={15} /> : index + 1}</span>
              <span aria-hidden="true" className="kids-world-icon">{subject.icon}</span>
              <span className="kids-world-copy">
                <strong>{getLocalized(subject, language, "world")}</strong>
                <small>{getLocalized(subject, language, "name")}</small>
              </span>
              <span className="kids-world-progress">
                <span><i style={{ width: `${mastery}%` }} /></span>
                <small>{mastery}% {copy.mastery}</small>
              </span>
              {complete ? (
                <Sparkles aria-hidden="true" className="kids-world-arrow" size={20} />
              ) : mastery > 0 ? (
                <ChevronRight aria-hidden="true" className="kids-world-arrow" size={20} />
              ) : (
                <LockKeyhole aria-hidden="true" className="kids-world-arrow kids-world-ready" size={17} />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
