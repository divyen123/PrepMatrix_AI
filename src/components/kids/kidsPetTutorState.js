export function reduceCompanionBubbleState(currentState, action) {
  if (action === "leave" || action === "blur") return "idle";
  if (action === "enter" || action === "focus") {
    return currentState === "idle" ? "hover" : currentState;
  }
  if (action === "click") return currentState === "pinned" ? "dismissed" : "pinned";
  return currentState;
}
