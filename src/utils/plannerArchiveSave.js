export async function savePlannerArchiveAttempt({ attempt, snapshot, saveWorkspace, isScopeCurrent, onRequest = () => {} }) {
  const checkScope = () => {
    if (!isScopeCurrent()) throw new Error("Your academic profile changed. Open Planner again.");
  };
  const save = async (workspace) => {
    const request = saveWorkspace(workspace);
    onRequest(request);
    return request;
  };
  checkScope();
  if (!attempt.snapshotPersisted) {
    await save(snapshot);
    attempt.snapshotPersisted = true;
    checkScope();
  }
  const response = await save(attempt.cleared);
  checkScope();
  return response;
}
