import { getPlannerMetrics } from "../utils/plannerMetrics";
import { buildSubjectMaterials } from "../utils/materialRecommendations";

function ResourcesHub({
  academicLevel = "College",
  academicTrack = "General",
  completed = [],
  materialBookmarks = [],
  onRemoveBookmark,
  onSaveBookmark,
  schedule = [],
  subjects = [],
}) {
  const metrics = getPlannerMetrics(schedule, completed);
  const materials = subjects.map((subject) =>
    buildSubjectMaterials(subject, metrics.subjectStats[subject.name], academicLevel, academicTrack)
  );

  const savedLinks = new Set(materialBookmarks.map((bookmark) => bookmark.href));

  if (subjects.length === 0) {
    return (
      <section className="card resources-shell">
        <div className="section-intro compact-intro">
          <span className="section-tag">Resources</span>
          <h2>Learning materials</h2>
        </div>
        <p className="empty-state">
          Add subjects first. PrepMatrix will then suggest chapter-wise learning lanes,
          revision prompts, and practice searches for each subject.
        </p>
      </section>
    );
  }

  return (
    <section className="resources-shell">
      <div className="resources-summary-grid">
        <article className="card resources-summary-card">
          <span className="section-tag">Resources</span>
          <h3>Guided learning map</h3>
          <span className="resource-level-chip">{academicLevel} - {academicTrack}</span>
          <p className="card-subtext">
            Chapter-aware suggestions combine concept lessons, notes, practice, and
            revision prompts for each subject.
          </p>
        </article>
      </div>

      {materialBookmarks.length > 0 ? (
        <section className="card bookmark-library-card">
          <div className="resources-bookmark-header">
            <div>
              <span className="section-tag">Saved library</span>
              <h3>Material bookmarks</h3>
            </div>
            <span>{materialBookmarks.length} saved</span>
          </div>

          <div className="bookmark-grid">
            {materialBookmarks.map((bookmark) => (
              <article className="bookmark-card" key={bookmark.id}>
                <span>{bookmark.subject}</span>
                <strong>{bookmark.title}</strong>
                <p>{bookmark.provider}</p>
                <div className="bookmark-actions">
                  <a href={bookmark.href} rel="noreferrer" target="_blank">Open</a>
                  <button onClick={() => onRemoveBookmark?.(bookmark.id)} type="button">Remove</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <div className="resources-grid">
        {materials.map((resource) => (
          <article className="card resource-card" key={resource.subject}>
            <div className="resource-card-header">
              <div>
                <span className="section-tag">{resource.trackLabel}</span>
                <h3>{resource.subject}</h3>
              </div>
              <span className="resource-progress-chip">{resource.completionLabel}</span>
            </div>

            <p className="card-desc">{resource.spotlight}</p>

            <div className="resource-lane-grid">
              {resource.lanes.map((lane) => {
                const saved = savedLinks.has(lane.href);

                return (
                  <div className="resource-link-card resource-save-card" key={`${resource.subject}-${lane.title}`}>
                    <a href={lane.href} rel="noreferrer" target="_blank">
                      <span className="resource-provider">{lane.provider}</span>
                      <strong>{lane.title}</strong>
                      <p>{lane.description}</p>
                    </a>
                    <button
                      className={saved ? "bookmark-btn saved" : "bookmark-btn"}
                      disabled={saved}
                      onClick={() =>
                        onSaveBookmark?.({
                          academicLevel,
                          academicTrack,
                          description: lane.description,
                          href: lane.href,
                          provider: lane.provider,
                          subject: resource.subject,
                          title: lane.title,
                        })
                      }
                      type="button"
                    >
                      {saved ? "Saved" : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="resource-chapter-strip">
              {resource.chapterPath.map((chapter) => (
                <div className="resource-chapter-pill" key={`${resource.subject}-chapter-${chapter.chapterNumber}`}>
                  <strong>Chapter {chapter.chapterNumber}</strong>
                  <span>{chapter.status}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ResourcesHub;

