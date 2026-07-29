export function getNoteWorkflowStatus(note, plannerState) {
  if (plannerState?.state === "completed") return "Resolved";
  return note?.status === "Resolved" ? "Resolved" : "Open";
}

export function getNotesBoardStatusCounts(notes = [], plannerStates = new Map()) {
  return notes.reduce((counts, note) => {
    const plannerState = plannerStates.get(note?.id);
    const workflowStatus = getNoteWorkflowStatus(note, plannerState);

    if (workflowStatus === "Resolved") {
      counts.completed += 1;
    } else if (plannerState?.state === "added") {
      counts.inProcess += 1;
    } else {
      counts.open += 1;
    }

    return counts;
  }, { open: 0, completed: 0, inProcess: 0 });
}
