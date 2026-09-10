import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../utils/apiClient";
import { getLearnerRoutePolicy } from "../utils/learnerRouting";
import PrepMatrixGuideDialog from "./PrepMatrixGuideDialog";
import StudentDetailsDialog from "./StudentDetailsDialog";

function FirstLoginGuideCoordinator({ onUserUpdated }) {
  const location = useLocation();
  const checkGenerationRef = useRef(0);
  const checkedSessionRef = useRef(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [academicProfile, setAcademicProfile] = useState({});
  const [userName, setUserName] = useState("");
  const [student, setStudent] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const onUserUpdatedRef = useRef(onUserUpdated);
  useEffect(() => { onUserUpdatedRef.current = onUserUpdated; }, [onUserUpdated]);
  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";

  useEffect(() => {
    const generation = checkGenerationRef.current + 1;
    checkGenerationRef.current = generation;
    let timerId;

    if (isAuthRoute) {
      checkedSessionRef.current = false;
      setGuideOpen(false);
      setAcademicProfile({});
      setUserName("");
      setStudent(null);
      setDetailsOpen(false);
      return undefined;
    }

    if (checkedSessionRef.current) return undefined;

    const checkWhenWorkspaceIsReady = () => {
      if (generation !== checkGenerationRef.current) return;

      let pinSetupPending = false;
      try {
        pinSetupPending = window.sessionStorage.getItem("prepmatrix_kids_pin_setup_pending") === "true";
      } catch {
        // The server remains authoritative when browser storage is unavailable.
      }
      if (pinSetupPending) {
        return;
      }

      if (document.querySelector(".entry-splash")) {
        timerId = window.setTimeout(checkWhenWorkspaceIsReady, 120);
        return;
      }

      api.me()
        .then(async ({ user }) => {
          if (generation !== checkGenerationRef.current) return;
          const routePolicy = getLearnerRoutePolicy(user);
          if (routePolicy.isYoungKidsLearner) {
            try {
              const status = await api.get("/api/kids/parent-access");
              if (status?.parentAccess?.setupRequired) {
                try {
                  window.sessionStorage.setItem("prepmatrix_kids_pin_setup_pending", "true");
                } catch {
                  // The Kids route still opens setup from the server response.
                }
                return;
              }
            } catch {
              // The main kids route owns access errors and recovery messaging.
            }
          }
          if (generation !== checkGenerationRef.current) return;
          checkedSessionRef.current = true;
          setStudent(user);
          setAcademicProfile(routePolicy.academicProfile);
          setUserName(user.username || "");
          setGuideOpen(user.needsOnboardingGuide === true);
          setDetailsOpen(!user.needsOnboardingGuide && user.needsProfileDetails === true);
        })
        .catch(() => {
          // App handles expired sessions and backend availability messaging.
        });
    };

    const resumeAfterPinSetup = () => {
      try {
        window.sessionStorage.removeItem("prepmatrix_kids_pin_setup_pending");
      } catch {
        // The in-memory event is enough to resume the guide.
      }
      checkWhenWorkspaceIsReady();
    };
    window.addEventListener("prepmatrixKidsPinSetupComplete", resumeAfterPinSetup);
    checkWhenWorkspaceIsReady();
    return () => {
      checkGenerationRef.current += 1;
      if (timerId) window.clearTimeout(timerId);
      window.removeEventListener("prepmatrixKidsPinSetupComplete", resumeAfterPinSetup);
    };
  }, [isAuthRoute]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    setDetailsOpen(student?.needsProfileDetails === true);
    const generation = checkGenerationRef.current;
    api.put("/api/auth/onboarding-guide", {}).then(() => {
      if (generation === checkGenerationRef.current) {
        onUserUpdatedRef.current?.({ id: student?.id, needsOnboardingGuide: false });
      }
    }).catch(() => {
      // Keep the server flag pending so the guide can be offered again later.
    });
  }, [student]);

  return (
    <>
      <PrepMatrixGuideDialog
        academicProfile={academicProfile}
        onClose={closeGuide}
        open={guideOpen}
        userName={userName}
        variant="onboarding"
      />
      {!guideOpen && detailsOpen && student && (
        <StudentDetailsDialog
          key={student.id}
          onLater={() => setDetailsOpen(false)}
          onSaved={(saved) => {
            setDetailsOpen(false);
            setStudent(saved);
            onUserUpdatedRef.current?.(saved);
          }}
          user={student}
        />
      )}
    </>
  );
}

export default FirstLoginGuideCoordinator;
