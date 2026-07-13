import ResourcesHub from "../components/ResourcesHub";

function ResourcesPage({
  academicLevel,
  academicTrack,
  subjects,
  schedule,
  completed,
  materialBookmarks,
  onClearBookmarks,
  onSaveBookmark,
  onRemoveBookmark,
}) {
  return (
    <section className="page-stack">
      <div className="section-intro">
        <span className="section-tag">Materials</span>
        <h2>Suggested learning materials by subject</h2>
      </div>

      <ResourcesHub
        academicLevel={academicLevel}
        academicTrack={academicTrack}
        completed={completed}
        materialBookmarks={materialBookmarks}
        onClearBookmarks={onClearBookmarks}
        onRemoveBookmark={onRemoveBookmark}
        onSaveBookmark={onSaveBookmark}
        schedule={schedule}
        subjects={subjects}
      />
    </section>
  );
}

export default ResourcesPage;

