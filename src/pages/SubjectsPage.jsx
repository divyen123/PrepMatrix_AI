import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import AddSubject from "../components/AddSubject";
import SubjectList from "../components/SubjectList";
import SubjectSnapshotDialog from "../components/SubjectSnapshotDialog";
import {
  ACADEMIC_LEVEL_OPTIONS,
  SCHOOL_CLASS_OPTIONS,
  TRACK_OPTIONS,
  isSchoolAcademicLevel,
  normalizeAcademicProfile,
} from "../utils/academicProfile";

function SubjectsPage({
  academicLevel,
  academicTrack,
  hasActiveSchedule = false,
  setAcademicLevel,
  setAcademicTrack,
  subjects,
  setSubjects,
  userProfile,
  onAcademicProfileChange,
}) {
  const addSubjectRef = useRef(null);
  const subjectLibraryRef = useRef(null);
  const [activeSnapshot, setActiveSnapshot] = useState(null);
  const totalChapters = subjects.reduce(
    (sum, subject) => sum + (Number(subject?.chapters) || 0),
    0,
  );
  const hardSubjects = subjects.filter((subject) => subject.difficulty === "hard").length;
  const academicProfile = normalizeAcademicProfile({ ...userProfile, academicLevel, academicTrack });
  const isSchoolLearner = isSchoolAcademicLevel(academicProfile.academicLevel);
  const qualification = isSchoolLearner
    ? academicProfile.grade || academicProfile.academicLevel
    : academicProfile.degree || academicProfile.academicLevel;
  const updateAcademicProfile = onAcademicProfileChange || ((patch) => {
    if (patch.academicLevel) setAcademicLevel?.(patch.academicLevel);
    if (patch.academicTrack) setAcademicTrack?.(patch.academicTrack);
  });
  const snapshotMetrics = [
    {
      desktopLabel: "Total subjects",
      id: "subjects",
      mobileLabel: "Subjects",
      value: subjects.length,
    },
    {
      desktopLabel: "Total chapters",
      id: "chapters",
      mobileLabel: "Chapters",
      value: totalChapters,
    },
    {
      desktopLabel: "Hard-priority subjects",
      id: "hard",
      mobileLabel: "Hard",
      value: hardSubjects,
    },
  ];

  const handleSnapshotPrimaryAction = (target) => {
    const targetRef = target === "add-subject" ? addSubjectRef : subjectLibraryRef;
    setActiveSnapshot(null);

    window.requestAnimationFrame(() => {
      const targetElement = targetRef.current;
      if (!targetElement) return;

      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      const focusTarget = target === "add-subject"
        ? targetElement.querySelector("input")
        : targetElement.querySelector(".subject-card-open, button");
      focusTarget?.focus({ preventScroll: true });
    });
  };

  return (
    <section className="page-stack">
      <div className="section-intro">
        <span className="section-tag">Subjects</span>
        <h2>Build your study portfolio</h2>
      </div>

      <div className="page-two-column subjects-page-grid">
        <div className="page-stack">
          <section className="card class-profile-card">
            <div className="academic-profile-heading">
              <div>
                <span className="section-tag">Learner context</span>
                <h3>One profile for every study module</h3>
              </div>
              <span className="academic-sync-badge">Synced with Settings</span>
            </div>

            <div className="academic-profile-summary" aria-live="polite">
              <div><span>Stage</span><strong>{academicProfile.academicLevel}</strong></div>
              <div><span>Class / qualification</span><strong>{qualification}</strong></div>
              <div><span>Curriculum / field</span><strong>{academicProfile.academicTrack}</strong></div>
            </div>

            <div>
              <p className="card-subtext">
                Resources, quizzes, explanations, and exams stay inside this stage, curriculum, and specialization.
              </p>
            </div>

            <div className="profile-select-grid academic-profile-grid">
              <label className="field-stack class-select-field">
                Academic stage
                <select
                  onChange={(event) => {
                    const nextLevel = event.target.value;
                    const nextIsSchool = isSchoolAcademicLevel(nextLevel);
                    updateAcademicProfile({
                      academicLevel: nextLevel,
                      schoolType: nextIsSchool ? "school" : "college",
                      grade: nextIsSchool ? academicProfile.grade : "",
                      degree: nextIsSchool ? "" : academicProfile.degree,
                    });
                  }}
                  value={academicProfile.academicLevel}
                >
                  {ACADEMIC_LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="field-stack class-select-field">
                {isSchoolLearner ? "Exact class" : "Degree / qualification"}
                {isSchoolLearner ? (
                  <select
                    onChange={(event) => updateAcademicProfile({ grade: event.target.value, schoolType: "school" })}
                    value={academicProfile.grade}
                  >
                    <option value="">Choose class</option>
                    {SCHOOL_CLASS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input
                    onChange={(event) => updateAcademicProfile({ degree: event.target.value, schoolType: "college" })}
                    placeholder="e.g. B.Tech IT, MBBS, LLB, M.Sc"
                    value={academicProfile.degree}
                  />
                )}
              </label>

              <label className="field-stack class-select-field">
                Board / curriculum / field
                <select
                  onChange={(event) => updateAcademicProfile({ academicTrack: event.target.value })}
                  value={academicProfile.academicTrack}
                >
                  {!TRACK_OPTIONS.includes(academicProfile.academicTrack) && (
                    <option value={academicProfile.academicTrack}>{academicProfile.academicTrack}</option>
                  )}
                  {TRACK_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              {!isSchoolLearner && (
                <label className="field-stack class-select-field">
                  Department / specialization
                  <input
                    onChange={(event) => updateAcademicProfile({ department: event.target.value })}
                    placeholder="e.g. Cardiology, Constitutional Law, Data Science"
                    value={academicProfile.department}
                  />
                </label>
              )}
            </div>

            <p className="academic-profile-note">
              Changes save automatically and appear in Settings, Exam, Quiz, Materials, and the study assistant.
            </p>
          </section>

          <div className="subject-page-anchor" ref={addSubjectRef}>
            <AddSubject subjects={subjects} setSubjects={setSubjects} />
          </div>
          <div className="subject-page-anchor" ref={subjectLibraryRef}>
            <SubjectList hasActiveSchedule={hasActiveSchedule} subjects={subjects} setSubjects={setSubjects} />
          </div>
        </div>

        <div className="page-stack subjects-side-panel">
          <article className="card route-highlight-card subject-overview-card">
            <span className="section-tag">Overview</span>
            <h3>Subject load snapshot</h3>
            <ul className="metric-list">
              {snapshotMetrics.map((metric) => (
                <li className="subject-snapshot-metric" key={metric.id}>
                  <button
                    aria-expanded={activeSnapshot === metric.id}
                    aria-haspopup="dialog"
                    aria-label={`${metric.desktopLabel}: ${metric.value}. Open details`}
                    className="subject-snapshot-trigger"
                    onClick={() => setActiveSnapshot(metric.id)}
                    type="button"
                  >
                    <strong>{metric.value}</strong>
                    <span className="desktop-only-text">{metric.desktopLabel}</span>
                    <span className="mobile-only-text">{metric.mobileLabel}</span>
                    <span className="subject-snapshot-open-cue" aria-hidden="true">
                      <ChevronRight size={16} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="card route-highlight-card">
            <span className="section-tag">Learning level</span>
            <h3>{qualification}</h3>
            <p className="card-desc">
              {academicProfile.academicLevel} · {academicProfile.academicTrack}
              {academicProfile.department ? ` · ${academicProfile.department}` : ""}. Every adaptive module uses this same profile.
            </p>
          </article>

          <article className="card route-highlight-card">
            <span className="section-tag">Next layer</span>
            <h3>Turn subjects into guided materials</h3>
            <p className="card-desc">
              Once your subjects are in place, PrepMatrix can suggest concept videos,
              notes, practice tracks, and revision searches chapter by chapter.
            </p>
            <Link className="route-link-btn" to="/resources">Open materials hub</Link>
          </article>
        </div>
      </div>

      {activeSnapshot && (
        <SubjectSnapshotDialog
          activeSnapshot={activeSnapshot}
          onClose={() => setActiveSnapshot(null)}
          onPrimaryAction={handleSnapshotPrimaryAction}
          subjects={subjects}
        />
      )}
    </section>
  );
}

export default SubjectsPage;

