import { Link } from "react-router-dom";
import AddSubject from "../components/AddSubject";
import SubjectList from "../components/SubjectList";

const CLASS_OPTIONS = [...Array.from({ length: 12 }, (_, index) => `Class ${index + 1}`), "College"];
const TRACK_OPTIONS = [
  "General",
  "CBSE",
  "State Board",
  "ICSE",
  "Engineering",
  "Degree",
  "Diploma",
  "Competitive Exam",
];

function SubjectsPage({
  academicLevel,
  academicTrack,
  setAcademicLevel,
  setAcademicTrack,
  subjects,
  setSubjects,
}) {
  const totalChapters = subjects.reduce((sum, subject) => sum + subject.chapters, 0);
  const hardSubjects = subjects.filter((subject) => subject.difficulty === "hard").length;

  return (
    <section className="page-stack">
      <div className="section-intro">
        <span className="section-tag">Subjects</span>
        <h2>Build your study portfolio</h2>
      </div>

      <div className="page-two-column subjects-page-grid">
        <div className="page-stack">
          <section className="card class-profile-card">
            <div>
              <span className="section-tag">Class profile</span>
              <h3>Choose your academic level</h3>
              <p className="card-subtext">
                PrepMatrix will tune learning materials, AI suggestions, and search links for this profile.
              </p>
            </div>

            <div className="profile-select-grid">
              <label className="field-stack class-select-field">
                Student class
                <select
                  onChange={(event) => setAcademicLevel(event.target.value)}
                  value={academicLevel}
                >
                  {CLASS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

              <label className="field-stack class-select-field">
                Board / stream
                <select
                  onChange={(event) => setAcademicTrack(event.target.value)}
                  value={academicTrack}
                >
                  {TRACK_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <AddSubject subjects={subjects} setSubjects={setSubjects} />
          <SubjectList subjects={subjects} setSubjects={setSubjects} />
        </div>

        <div className="page-stack subjects-side-panel">
          <article className="card route-highlight-card subject-overview-card">
            <span className="section-tag">Overview</span>
            <h3>Subject load snapshot</h3>
            <ul className="metric-list">
              <li><strong>{subjects.length}</strong><span>Total subjects</span></li>
              <li><strong>{totalChapters}</strong><span>Total chapters</span></li>
              <li><strong>{hardSubjects}</strong><span>Hard-priority subjects</span></li>
            </ul>
          </article>

          <article className="card route-highlight-card">
            <span className="section-tag">Learning level</span>
            <h3>{academicLevel}</h3>
            <p className="card-desc">
              Current mode: {academicTrack}. Materials and assistant guidance will use this profile to stay syllabus-aware.
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
    </section>
  );
}

export default SubjectsPage;

