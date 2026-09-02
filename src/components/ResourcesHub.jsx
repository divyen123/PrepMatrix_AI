import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check, ChevronLeft, Search, Trash2, X } from "lucide-react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { buildSubjectMaterials } from "../utils/materialRecommendations";
import { normalizeMaterialBookmarks } from "../utils/materialBookmarks";
import { resolveMaterialGuideSubjects } from "../utils/materialGuideNavigation";

const SUBJECT_CARD_TONES = ["teal", "indigo", "amber", "violet", "rose"];

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
  academicProfile = {},
  academicLevel = "College",
  academicTrack = "General",
  completed = [],
  materialBookmarks = [],
  onClearBookmarks,
  onRemoveBookmark,
  onSaveBookmark,
  schedule = [],
  subjects = [],
}) {
  const [bookmarkSearchQuery, setBookmarkSearchQuery] = useState("");
  const [confirmClearAllBookmarks, setConfirmClearAllBookmarks] = useState(false);
  const [pendingBookmarkRemovalId, setPendingBookmarkRemovalId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingViewFocusRef = useRef("");
  const subjectOverviewHeadingRef = useRef(null);
  const subjectDetailHeadingRef = useRef(null);
  const targetSubject = searchParams.get("subject");
  const guide = useMemo(
    () => resolveMaterialGuideSubjects(subjects, targetSubject),
    [subjects, targetSubject],
  );
  const metrics = getPlannerMetrics(schedule, completed);
  const materials = guide.subjects.map((subject) =>
    buildSubjectMaterials(subject, metrics.subjectStats[subject.name], academicLevel, academicTrack, academicProfile)
  );
  const activeResource = guide.focusedSubject
    ? materials.find((resource) => resource.subject === guide.focusedSubject) || null
    : null;

  const safeMaterialBookmarks = useMemo(
    () => normalizeMaterialBookmarks(materialBookmarks),
    [materialBookmarks]
  );
  const savedLinks = new Set(safeMaterialBookmarks.map((bookmark) => bookmark.href));
  const filteredMaterialBookmarks = useMemo(() => {
    if (!bookmarkSearchQuery.trim()) return safeMaterialBookmarks;

    return safeMaterialBookmarks
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
  }, [bookmarkSearchQuery, safeMaterialBookmarks]);

  useEffect(() => {
    const nextView = activeResource ? "detail" : "overview";
    if (pendingViewFocusRef.current !== nextView) return undefined;

    const frame = window.requestAnimationFrame(() => {
      const target = activeResource
        ? subjectDetailHeadingRef.current
        : subjectOverviewHeadingRef.current;
      target?.focus();
      pendingViewFocusRef.current = "";
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeResource]);

  const openSubjectMaterials = (subject) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set("subject", subject);
    pendingViewFocusRef.current = "detail";
    setSearchParams(nextSearchParams);
  };

  const returnToSubjects = () => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("subject");
    pendingViewFocusRef.current = "overview";
    setSearchParams(nextSearchParams);
  };

  return (
    <section className="resources-shell">


      {!activeResource && safeMaterialBookmarks.length > 0 ? (
        <section className="card bookmark-library-card">
          <div className="resources-bookmark-header">
            <div>
              <span className="section-tag">Saved library</span>
              <h3>Material bookmarks</h3>
            </div>
            <div className="resources-bookmark-tools">
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
              <span className="resources-bookmark-count">{safeMaterialBookmarks.length} saved</span>
              {confirmClearAllBookmarks ? (
                <div
                  aria-label="Confirm clearing all saved materials"
                  className="bookmark-clear-confirm compact-confirm-actions"
                  role="group"
                >
                  <span className="compact-confirm-copy">Clear all?</span>
                  <button
                    aria-label="Confirm clearing all saved materials"
                    className="compact-confirm-btn is-confirm"
                    onClick={() => {
                      setConfirmClearAllBookmarks(false);
                      setPendingBookmarkRemovalId(null);
                      setBookmarkSearchQuery("");
                      onClearBookmarks?.();
                    }}
                    title="Confirm clear all"
                    type="button"
                  ><Check aria-hidden="true" size={13} /></button>
                  <button
                    aria-label="Cancel clearing all saved materials"
                    className="compact-confirm-btn is-cancel"
                    onClick={() => setConfirmClearAllBookmarks(false)}
                    title="Cancel"
                    type="button"
                  ><X aria-hidden="true" size={13} /></button>
                </div>
              ) : (
                <button
                  aria-label="Clear all saved materials"
                  className="bookmark-clear-all-btn"
                  onClick={() => {
                    setPendingBookmarkRemovalId(null);
                    setConfirmClearAllBookmarks(true);
                  }}
                  title="Clear all saved materials"
                  type="button"
                ><Trash2 aria-hidden="true" size={15} /></button>
              )}
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
                <article className="bookmark-card" key={bookmark.id || bookmark.href}>
                  <span>{bookmark.subject}</span>
                  <strong>{bookmark.title}</strong>
                  <p>{bookmark.provider}</p>
                  <div className="bookmark-actions">
                    <a href={bookmark.href} rel="noreferrer" target="_blank">Open</a>
                    {pendingBookmarkRemovalId === (bookmark.id || bookmark.href) ? (
                      <div className="bookmark-remove-confirm" role="group" aria-label={`Confirm removing ${bookmark.title}`}>
                        <button
                          aria-label={`Confirm removing ${bookmark.title}`}
                          className="compact-confirm-btn is-confirm"
                          onClick={() => {
                            onRemoveBookmark?.(bookmark.id || bookmark.href);
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
                        onClick={() => {
                          setConfirmClearAllBookmarks(false);
                          setPendingBookmarkRemovalId(bookmark.id || bookmark.href);
                        }}
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

      {!activeResource && guide.subjects.length === 0 ? (
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

      {activeResource ? (
        <div className="resource-detail-view" key={`resource-detail-${activeResource.subject}`}>
          <article className="card resource-card resource-detail-card">
            <div className="resource-detail-navigation">
              <button
                aria-label="Back to subjects"
                className="resource-detail-back"
                onClick={returnToSubjects}
                title="Back to subjects"
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={18} />
              </button>
              <div className="resource-detail-title">
                <span className="section-tag">Subject materials</span>
                <h3 ref={subjectDetailHeadingRef} tabIndex={-1}>{activeResource.subject}</h3>
              </div>
              <span className="resource-progress-text">{activeResource.completionLabel}</span>
            </div>

            <p className="card-desc">{activeResource.spotlight}</p>

            <div className="resource-lane-grid">
              {activeResource.lanes.map((lane) => {
                const saved = savedLinks.has(lane.href);

                return (
                  <div className="resource-link-card resource-save-card" key={`${activeResource.subject}-${lane.title}`}>
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
                          subject: activeResource.subject,
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
              {activeResource.chapterPath.map((chapter) => (
                <div className="resource-chapter-pill" key={`${activeResource.subject}-chapter-${chapter.chapterNumber}`}>
                  <strong>Chapter {chapter.chapterNumber}</strong>
                  <span>{chapter.status}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      ) : materials.length > 0 ? (
        <section className="resource-subject-overview" key="resource-subject-overview">
          <div className="resource-subject-intro">
            <span className="section-tag">Subject library</span>
            <h3 ref={subjectOverviewHeadingRef} tabIndex={-1}>Choose a subject</h3>
            <p>Open a subject to see its focused lessons, references, practice, and revision materials.</p>
          </div>

          <div className="resource-subject-grid">
            {materials.map((resource, index) => (
              <button
                aria-label={`Open ${resource.subject} materials`}
                className={`resource-subject-card tone-${SUBJECT_CARD_TONES[index % SUBJECT_CARD_TONES.length]}`}
                key={resource.subject}
                onClick={() => openSubjectMaterials(resource.subject)}
                style={{ "--resource-card-delay": `${index * 65}ms` }}
                type="button"
              >
                <span className="resource-subject-card__icon">
                  <BookOpen aria-hidden="true" size={22} />
                </span>
                <span className="resource-subject-card__copy">
                  <small>Subject</small>
                  <strong>{resource.subject}</strong>
                </span>
                <span className="resource-subject-card__footer">
                  <span>{resource.completionLabel}</span>
                  <ArrowRight aria-hidden="true" size={19} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

export default ResourcesHub;
