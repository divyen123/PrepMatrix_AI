import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Search, X } from "lucide-react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { buildSubjectMaterials } from "../utils/materialRecommendations";

function rankSearchMatch(fields, query) {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return 0;

  return fields.reduce((best, field) => {
    const value = String(field || "").toLowerCase();
    if (!value.includes(cleanQuery)) return best;
    if (value === cleanQuery) return Math.max(best, 4);
    if (value.startsWith(cleanQuery)) return Math.max(best, 3);
    return Math.max(best, 2);
  }, 0);
}

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
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState("");
  const [pendingBookmarkRemovalId, setPendingBookmarkRemovalId] = useState(null);
  const metrics = getPlannerMetrics(schedule, completed);
  const materials = subjects.map((subject) =>
    buildSubjectMaterials(subject, metrics.subjectStats[subject.name], academicLevel, academicTrack)
  );

  const savedLinks = new Set(materialBookmarks.map((bookmark) => bookmark.href));
  const filteredMaterialBookmarks = useMemo(() => {
    if (!bookmarkSearchQuery.trim()) return materialBookmarks;

    return materialBookmarks
      .map((bookmark, index) => ({
        bookmark,
        index,
        rank: rankSearchMatch(
          [bookmark.subject, bookmark.title, bookmark.provider, bookmark.description, bookmark.href],
          bookmarkSearchQuery
        ),
      }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((item) => item.bookmark);
  }, [bookmarkSearchQuery, materialBookmarks]);

  const [searchParams] = useSearchParams();
  const targetSubject = searchParams.get("subject");
  useEffect(() => {
    if (targetSubject && materials.length > 0) {
      const element = document.getElementById(`subject-${targetSubject.replace(/\s+/g, "-")}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("highlighted-card");
        const timer = setTimeout(() => {
          element.classList.remove("highlighted-card");
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [targetSubject, materials]);

  return (
    <section className="resources-shell">
      {subjects.length > 0 ? (
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
      ) : null}

      {materialBookmarks.length > 0 ? (
        <section className="card bookmark-library-card">
          <div className="resources-bookmark-header">
            <div>
              <span className="section-tag">Saved library</span>
              <h3>Material bookmarks</h3>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label className="stored-search-field bookmark-desktop-search">
                <Search size={16} />
                <input
                  aria-label="Search saved materials"
                  onChange={(event) => setBookmarkSearchQuery(event.target.value)}
                  placeholder="Search by subject, title, provider, or link"
                  type="search"
                  value={bookmarkSearchQuery}
                />
              </label>
              <span>{materialBookmarks.length} saved</span>
            </div>
          </div>

          <label className="stored-search-field bookmark-mobile-search">
            <Search size={16} />
            <input
              aria-label="Search saved materials"
              onChange={(event) => setBookmarkSearchQuery(event.target.value)}
              placeholder="Search by subject, title, provider, or link"
              type="search"
              value={bookmarkSearchQuery}
            />
          </label>

          {filteredMaterialBookmarks.length === 0 ? (
            <p className="empty-state">No saved materials match your search.</p>
          ) : (
            <div className="bookmark-grid">
              {filteredMaterialBookmarks.map((bookmark) => (
                <article className="bookmark-card" key={bookmark.id}>
                  <span>{bookmark.subject}</span>
                  <strong>{bookmark.title}</strong>
                  <p>{bookmark.provider}</p>
                  <div className="bookmark-actions">
                    <a href={bookmark.href} rel="noreferrer" target="_blank">Open</a>
                    {pendingBookmarkRemovalId === bookmark.id ? (
                      <div className="bookmark-remove-confirm" role="group" aria-label={`Confirm removing ${bookmark.title}`}>
                        <button
                          aria-label={`Confirm removing ${bookmark.title}`}
                          className="compact-confirm-btn is-confirm"
                          onClick={() => {
                            onRemoveBookmark?.(bookmark.id);
                            setPendingBookmarkRemovalId(null);
                          }}
                          title="Confirm remove"
                          type="button"
                        >
                          <Check aria-hidden="true" size={13} />
                        </button>
                        <button
                          aria-label={`Cancel removing ${bookmark.title}`}
                          className="compact-confirm-btn is-cancel"
                          onClick={() => setPendingBookmarkRemovalId(null)}
                          title="Cancel"
                          type="button"
                        >
                          <X aria-hidden="true" size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        aria-label={`Remove ${bookmark.title} from saved library`}
                        onClick={() => setPendingBookmarkRemovalId(bookmark.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {subjects.length === 0 ? (
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
      ) : null}

      <div className="resources-grid">
        {materials.map((resource) => (
          <article className="card resource-card" key={resource.subject} id={`subject-${resource.subject.replace(/\s+/g, "-")}`}>
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