import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronLeft, ExternalLink, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { buildSubjectMaterials } from "../utils/materialRecommendations";
import { materialBookmarkKey, normalizeMaterialBookmarks } from "../utils/materialBookmarks";
import { fetchSubjectBooks } from "../utils/bookRecommendations";
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

function BookCard({
  book,
  expanded,
  onToggle,
  saved,
  onSave,
  onRemove,
  removePending,
  onConfirmRemove,
  onCancelRemove,
}) {
  const [showRetailers, setShowRetailers] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const retailers = Array.isArray(book.retailers) ? book.retailers : [];

  return (
    <article className={expanded ? "material-book-card is-expanded" : "material-book-card"}>
      <button
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Show details for"} ${book.title}`}
        className="material-book-card__toggle"
        onClick={() => {
          setShowRetailers(false);
          onToggle();
        }}
        type="button"
      >
        <span className="material-book-card__cover">
          {book.cover && !coverFailed ? (
            <img
              alt=""
              loading="lazy"
              onError={() => setCoverFailed(true)}
              src={book.cover}
            />
          ) : <BookOpen aria-hidden="true" size={28} />}
        </span>
        <span className="material-book-card__summary">
          <strong>{book.title}</strong>
          {book.author ? <span>{book.author}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className="material-book-card__chevron" size={18} />
      </button>

      {expanded ? (
        <div className="material-book-card__details">
          <p>{book.description || "Description unavailable for this book."}</p>
          {book.edition || book.isbn ? (
            <p className="material-book-card__edition">
              {[book.edition, book.isbn ? `ISBN ${book.isbn}` : ""].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <div className="material-book-card__actions">
            {saved ? (
              onRemove ? (
                removePending ? (
                  <div className="material-book-card__remove-confirm" role="group" aria-label={`Confirm removing ${book.title}`}>
                    <span>Remove?</span>
                    <button aria-label={`Confirm removing ${book.title}`} onClick={onConfirmRemove} type="button"><Check aria-hidden="true" size={15} /></button>
                    <button aria-label={`Cancel removing ${book.title}`} onClick={onCancelRemove} type="button"><X aria-hidden="true" size={15} /></button>
                  </div>
                ) : (
                  <button className="material-book-card__button material-book-card__button--quiet" onClick={onRemove} type="button">Remove</button>
                )
              ) : (
                <button className="material-book-card__button material-book-card__button--quiet" disabled type="button"><Check aria-hidden="true" size={16} /> Saved</button>
              )
            ) : (
              <button className="material-book-card__button material-book-card__button--quiet" onClick={() => onSave?.(book)} type="button">Save</button>
            )}
            <button
              aria-expanded={showRetailers}
              className="material-book-card__button material-book-card__button--buy"
              disabled={retailers.length === 0}
              onClick={() => setShowRetailers((current) => !current)}
              type="button"
            >
              <ShoppingBag aria-hidden="true" size={16} /> Buy <ChevronDown aria-hidden="true" size={15} />
            </button>
          </div>
          {showRetailers ? (
            <div className="material-book-card__retailers">
              {retailers.map((retailer) => (
                <a href={retailer.href} key={`${retailer.name}-${retailer.href}`} rel="noopener noreferrer" target="_blank">
                  {retailer.mode === "search" ? `Search ${retailer.name}` : `Buy on ${retailer.name}`}
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function SubjectBookShelf({ subject, academicProfile, academicLevel, academicTrack, savedBookKeys, onSaveBookmark }) {
  const [result, setResult] = useState({ status: "loading", books: [] });
  const [expandedBookId, setExpandedBookId] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchSubjectBooks(subject, {
      ...academicProfile,
      academicLevel,
      academicTrack,
    }, { signal: controller.signal })
      .then((books) => {
        if (!controller.signal.aborted) setResult({ status: "ready", books });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error?.name !== "AbortError") {
          setResult({ status: "error", books: [] });
        }
      });

    return () => controller.abort();
  }, [subject, academicProfile, academicLevel, academicTrack, retryCount]);

  return (
    <section aria-label={`Books for ${subject}`} className="material-book-shelf" id="subject-books">
      {result.status === "loading" ? <p className="material-book-shelf__message" role="status">Finding books…</p> : null}
      {result.status === "error" ? (
        <div className="material-book-shelf__error" role="status">
          <p className="material-book-shelf__message">Books could not be loaded right now.</p>
          <button onClick={() => {
            setResult({ status: "loading", books: [] });
            setRetryCount((count) => count + 1);
          }} type="button">Try again</button>
        </div>
      ) : null}
      {result.status === "ready" && result.books.length === 0 ? <p className="material-book-shelf__message">No matching books found for this subject.</p> : null}
      {result.books.length > 0 ? (
        <div className="material-book-grid">
          {result.books.map((book) => (
            <BookCard
              book={book}
              expanded={expandedBookId === book.bookId}
              key={book.bookId}
              onSave={onSaveBookmark}
              onToggle={() => setExpandedBookId((current) => current === book.bookId ? "" : book.bookId)}
              saved={savedBookKeys.has(materialBookmarkKey(book))}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
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
  const [expandedSavedBookId, setExpandedSavedBookId] = useState("");
  const [booksOpen, setBooksOpen] = useState(false);
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
  const savedLinks = new Set(safeMaterialBookmarks.filter((bookmark) => bookmark.kind !== "book").map((bookmark) => bookmark.href));
  const savedBookKeys = new Set(safeMaterialBookmarks.filter((bookmark) => bookmark.kind === "book").map(materialBookmarkKey));
  const filteredMaterialBookmarks = useMemo(() => {
    if (!bookmarkSearchQuery.trim()) return safeMaterialBookmarks;

    return safeMaterialBookmarks
      .map((bookmark, index) => ({
        bookmark,
        index,
        rank: rankSearchMatch(
          [bookmark.subject, bookmark.title, bookmark.author, bookmark.provider, bookmark.description, bookmark.isbn, bookmark.href],
          bookmarkSearchQuery
        ),
      }))
      .filter((item) => item.rank > 0)
      .sort((a, b) => b.rank - a.rank || a.index - b.index)
      .map((item) => item.bookmark);
  }, [bookmarkSearchQuery, safeMaterialBookmarks]);
  const filteredSavedBooks = filteredMaterialBookmarks.filter((bookmark) => bookmark.kind === "book");
  const filteredSavedLinks = filteredMaterialBookmarks.filter((bookmark) => bookmark.kind !== "book");

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
    setBooksOpen(false);
    setSearchParams(nextSearchParams);
  };

  const returnToSubjects = () => {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("subject");
    pendingViewFocusRef.current = "overview";
    setBooksOpen(false);
    setSearchParams(nextSearchParams);
  };

  return (
    <section className="resources-shell">


      {!activeResource && safeMaterialBookmarks.length > 0 ? (
        <section className="card bookmark-library-card">
          <div className="resources-bookmark-header">
            <div>
              <h3>Saved Materials</h3>
            </div>
            <div className="resources-bookmark-tools">
              <label className="stored-search-field bookmark-desktop-search">
                <Search size={16} />
                <input
                  aria-label="Search saved materials"
                  onChange={(event) => setBookmarkSearchQuery(event.target.value)}
                  placeholder="Search saved materials"
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
              placeholder="Search saved materials"
              type="search"
              value={bookmarkSearchQuery}
            />
          </label>

          {filteredMaterialBookmarks.length === 0 ? (
            <p className="empty-state">No saved materials match your search.</p>
          ) : (
            <div className="saved-material-groups">
              {filteredSavedBooks.length > 0 ? (
                <div className="material-book-grid material-book-grid--saved">
                  {filteredSavedBooks.map((book) => {
                    const removalId = book.id || book.href;
                    return (
                      <BookCard
                        book={book}
                        expanded={expandedSavedBookId === book.bookId}
                        key={book.bookId || removalId}
                        onCancelRemove={() => setPendingBookmarkRemovalId(null)}
                        onConfirmRemove={() => {
                          onRemoveBookmark?.(removalId);
                          setPendingBookmarkRemovalId(null);
                          setExpandedSavedBookId("");
                        }}
                        onRemove={() => {
                          setConfirmClearAllBookmarks(false);
                          setPendingBookmarkRemovalId(removalId);
                        }}
                        onToggle={() => setExpandedSavedBookId((current) => current === book.bookId ? "" : book.bookId)}
                        removePending={pendingBookmarkRemovalId === removalId}
                        saved
                      />
                    );
                  })}
                </div>
              ) : null}
              {filteredSavedLinks.length > 0 ? (
                <div className="bookmark-grid">
                  {filteredSavedLinks.map((bookmark) => (
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
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {!activeResource && guide.subjects.length === 0 ? (
        <p className="resources-empty-message">
          Add subjects first. PrepMatrix will then suggest chapter-wise learning lanes,
          revision prompts, and practice searches for each subject.
        </p>
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
                <h3 ref={subjectDetailHeadingRef} tabIndex={-1}>{activeResource.subject}</h3>
              </div>
              <span className="resource-progress-text">{activeResource.completionLabel}</span>
            </div>

            <p className="card-desc">{activeResource.spotlight}</p>

            <div className="resource-book-entry">
              <button
                aria-controls={booksOpen ? "subject-books" : undefined}
                aria-expanded={booksOpen}
                className="resource-book-entry__button"
                onClick={() => setBooksOpen((current) => !current)}
                type="button"
              >
                <ShoppingBag aria-hidden="true" size={17} />
                Buy materials
                <ChevronDown aria-hidden="true" className="resource-book-entry__chevron" size={16} />
              </button>
            </div>

            {booksOpen ? (
              <SubjectBookShelf
                academicLevel={academicLevel}
                academicProfile={academicProfile}
                academicTrack={academicTrack}
                key={activeResource.subject}
                onSaveBookmark={onSaveBookmark}
                savedBookKeys={savedBookKeys}
                subject={activeResource.subject}
              />
            ) : null}

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
                  <span className="resource-subject-card__title">{resource.subject}</span>
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
