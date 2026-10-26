/** Save only subject data, and publish it locally after the server accepts it. */
export async function persistChatSubjectMutation({
  readCurrent,
  prepare,
  saveSubjects,
  commitSubjects,
  waitForPendingSave = async () => {},
}) {
  const origin = { ...readCurrent() };
  const scopeIsCurrent = () => {
    const current = readCurrent();
    return current.ready && current.profileId === origin.profileId && current.epoch === origin.epoch;
  };
  const assertScope = () => {
    if (!origin.ready || !origin.profileId || !scopeIsCurrent()) {
      throw new Error("Your academic profile changed or is still loading. Open the chat again and retry.");
    }
  };

  assertScope();
  await waitForPendingSave();
  assertScope();
  let saved = false;

  try {
    // A subject may be edited while the request is in flight. Rebase the import
    // on those edits instead of replacing them with an older subject list.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assertScope();
      const before = readCurrent().subjects;
      const mutation = prepare(before);
      if (!mutation.changed && !saved) return mutation;
      await saveSubjects(mutation.subjects, origin.profileId);
      saved = true;
      assertScope();
      if (readCurrent().subjects !== before) continue;
      if (mutation.changed) commitSubjects(mutation.subjects);
      return mutation;
    }
    throw new Error("Your subjects changed while saving. Review the outline and try again.");
  } catch (error) {
    if (saved && scopeIsCurrent()) {
      // If a rebase is no longer valid (for example the destination was deleted),
      // restore the latest local list. The app resumes normal autosave on exit.
      await saveSubjects(readCurrent().subjects, origin.profileId).catch(() => undefined);
    }
    throw error;
  }
}
