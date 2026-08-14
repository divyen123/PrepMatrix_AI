import { useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import AddSubject from "../components/AddSubject";
import SubjectList from "../components/SubjectList";
import SubjectSnapshotDialog from "../components/SubjectSnapshotDialog";
import {
  isSchoolAcademicLevel,
  normalizeAcademicProfile,
} from "../utils/academicProfile";

function SubjectsPage({
  academicLevel,
  academicTrack,
  hasActiveSchedule = false,
  subjects,
  setSubjects,
  userProfile,
  profileLocked = false,
  kidsMode = false,
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



            <div className="academic-profile-note" role="note">
              <p>
                {profileLocked
                  ? "The registered class, learning stage, and curriculum are fixed on Subjects. Open Parent Corner and Settings to correct them."
                  : "Your registered academic profile is read-only on Subjects so every study module stays consistent."}
              </p>
              {!profileLocked ? <Link to="/settings">Manage academic profile in Settings</Link> : null}
              <p>
                {profileLocked
                  ? "Add and organise subjects here. A parent PIN is still required before creating or changing the study schedule."
                  : "You can still add, edit, and organise all subjects below."}
              </p>
            </div>
          </section>

          <div className="subject-page-anchor" ref={addSubjectRef}>
            <AddSubject subjects={subjects} setSubjects={setSubjects} />
          </div>
          <div className="subject-page-anchor" ref={subjectLibraryRef}>
            <SubjectList
              hasActiveSchedule={hasActiveSchedule}
              kidsMode={kidsMode}
              setSubjects={setSubjects}
              subjects={subjects}
            />
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

