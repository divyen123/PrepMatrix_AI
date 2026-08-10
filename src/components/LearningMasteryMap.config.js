import { CheckCircle2, CircleDot, Clock3, RotateCcw } from "lucide-react";

export const MASTERY_STATUS_META = {
  new: { label: "New", color: "var(--mastery-tone-new)", icon: CircleDot },
  ready: { label: "Ready", color: "var(--mastery-tone-ready)", icon: CircleDot },
  learning: { label: "Learning", color: "var(--mastery-tone-learning)", icon: Clock3 },
  learned: { label: "Learned", color: "var(--mastery-tone-learned)", icon: CheckCircle2 },
  review_due: { label: "Review due", color: "var(--mastery-tone-review)", icon: RotateCcw },
  mastered: { label: "Mastered", color: "var(--mastery-tone-mastered)", icon: CheckCircle2 },
};

export function getMasteryMapInteractionProps(isUnlocked) {
  return {
    autoPanOnNodeDrag: isUnlocked,
    autoPanOnNodeFocus: isUnlocked,
    autoPanOnSelection: isUnlocked,
    disableKeyboardA11y: !isUnlocked,
    edgesFocusable: isUnlocked,
    elementsSelectable: isUnlocked,
    nodesDraggable: isUnlocked,
    nodesFocusable: isUnlocked,
    panActivationKeyCode: isUnlocked ? undefined : null,
    panOnDrag: isUnlocked,
    panOnScroll: isUnlocked,
    preventScrolling: isUnlocked,
    selectionKeyCode: isUnlocked ? undefined : null,
    selectionOnDrag: isUnlocked,
    zoomActivationKeyCode: isUnlocked ? undefined : null,
    zoomOnDoubleClick: isUnlocked,
    zoomOnPinch: isUnlocked,
    zoomOnScroll: isUnlocked,
  };
}
