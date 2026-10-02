import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { getPlannerMetrics } from "../utils/plannerMetrics";
import { buildSubjectMaterials } from "../utils/materialRecommendations";
import { materialBookmarkKey, normalizeMaterialBookmarks } from "../utils/materialBookmarks";
import { fetchSubjectBooks } from "../utils/bookRecommendations";
import { resolveMaterialGuideSubjects } from "../utils/materialGuideNavigation";
import { normalizeAcademicProfile } from "../utils/academicProfile";
import SubjectMaterialSearch from "./SubjectMaterialSearch";
import { BookDetailsDialog, BuyMaterialsDialog } from "./MaterialBookDialogs";

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

function BookCard({ book, onOpen }) {
  const [coverFailed, setCoverFailed] = useState(false);

  return (
    <article className="material-book-card">
      <button
        aria-label={`Open details for ${book.title}`}
        className="material-book-card__toggle"
        onClick={() => onOpen(book)}
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
        <ArrowRight aria-hidden="true" className="material-book-card__chevron" size={18} />
      </button>
    </article>
  );
}

function SavedBookCover({ src }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? <img alt="" className="bookmark-card__book-image" onError={() => setFailed(true)} src={src} /> : null;
}

export function SubjectBookShelf({ subject, academicProfile, academicLevel, academicTrack, onOpenBook }) {
  const [result, setResult] = useState({ status: "loading", books: [] });
  const [retryCount, setRetryCount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const totalPages = Math.max(1, Math.ceil(result.books.length / 2));

  useEffect(() => {
    const controller = new AbortController();
    fetchSubjectBooks(subject, {
      ...academicProfile,
      academicLevel,
      academicTrack,
    }, { signal: controller.signal })
      .then((books) => {
        if (!controller.signal.aborted) {
          setResult({ status: "ready", books });
          setPageIndex(0);
        }
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
          {result.books.slice(pageIndex * 2, pageIndex * 2 + 2).map((book) => (
            <BookCard book={book} key={book.bookId} onOpen={onOpenBook} />
          ))}
        </div>
      ) : null}
      {totalPages > 1 ? (
        <div aria-label="Browse materials" className="material-book-shelf__pagination">
          <button aria-label="Previous materials" disabled={pageIndex === 0} onClick={() => setPageIndex((page) => Math.max(0, page - 1))} type="button">
            <ChevronLeft aria-hidden="true" size={16} />
          </button>
          <span aria-live="polite">{pageIndex + 1} / {totalPages}</span>
          <button aria-label="Next materials" disabled={pageIndex === totalPages - 1} onClick={() => setPageIndex((page) => Math.min(totalPages - 1, page + 1))} type="button">
            <ChevronRight aria-hidden="true" size={16} />
          </button>
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
  const [openBook, setOpenBook] = useState(null);
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
  const activeSubject = activeResource
    ? guide.subjects.find((subject) => subject.name === activeResource.subject)
    : null;
  const institutionName = normalizeAcademicProfile(academicProfile).institutionName;

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
            <div className="bookmark-grid">
              {filteredMaterialBookmarks.map((bookmark) => {
                const removalId = bookmark.id || bookmark.href;
                const isBook = bookmark.kind === "book";
                return (
                  <article className={isBook ? "bookmark-card bookmark-card--book" : "bookmark-card"} key={removalId}>
                    {isBook ? <SavedBookCover src={bookmark.cover} /> : null}
                    <span>{bookmark.subject}</span>
                    <strong>{bookmark.title}</strong>
                    <p>{isBook ? bookmark.author : bookmark.provider}</p>
                    <div className="bookmark-actions">
                      {isBook ? <button onClick={() => setOpenBook(bookmark)} type="button">Open</button> : <a href={bookmark.href} rel="noreferrer" target="_blank">Open</a>}
                      {pendingBookmarkRemovalId === removalId ? (
                        <div className="bookmark-remove-confirm" role="group" aria-label={`Confirm removing ${bookmark.title}`}>
                          <button
                            aria-label={`Confirm removing ${bookmark.title}`}
                            className="compact-confirm-btn is-confirm"
                            onClick={() => {
                              onRemoveBookmark?.(removalId);
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
                            setPendingBookmarkRemovalId(removalId);
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
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

            <SubjectMaterialSearch
              institutionName={institutionName}
              key={`${activeResource.subject}-${institutionName}`}
              subject={activeSubject}
              trailingAction={(
                <button
                  aria-controls={booksOpen ? "material-buy-dialog" : undefined}
                  aria-expanded={booksOpen}
                  aria-haspopup="dialog"
                  className="resource-book-entry__button"
                  onClick={() => setBooksOpen(true)}
                  type="button"
                >
                  <ShoppingBag aria-hidden="true" size={16} />
                  Buy materials
                </button>
              )}
            />
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
      {booksOpen && activeResource ? (
        <BuyMaterialsDialog key={activeResource.subject} onClose={() => setBooksOpen(false)} subject={activeResource.subject}>
          <SubjectBookShelf
            academicLevel={academicLevel}
            academicProfile={academicProfile}
            academicTrack={academicTrack}
            onOpenBook={setOpenBook}
            subject={activeResource.subject}
          />
        </BuyMaterialsDialog>
      ) : null}
      {openBook ? (
        <BookDetailsDialog
          book={openBook}
          key={materialBookmarkKey(openBook)}
          onClose={() => setOpenBook(null)}
          onSave={onSaveBookmark}
          saved={savedBookKeys.has(materialBookmarkKey(openBook))}
        />
      ) : null}
    </section>
  );
}

export default ResourcesHub;
