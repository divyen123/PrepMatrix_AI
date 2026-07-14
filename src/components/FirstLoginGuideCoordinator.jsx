import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../utils/apiClient";
import PrepMatrixGuideDialog from "./PrepMatrixGuideDialog";

function FirstLoginGuideCoordinator() {
  const location = useLocation();
  const checkGenerationRef = useRef(0);
  const checkedSessionRef = useRef(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const isAuthRoute = location.pathname === "/login" || location.pathname === "/register";

  useEffect(() => {
    const generation = checkGenerationRef.current + 1;
    checkGenerationRef.current = generation;
    let timerId;

    if (isAuthRoute) {
      checkedSessionRef.current = false;
      setGuideOpen(false);
      setUserName("");
      return undefined;
    }

    if (checkedSessionRef.current) return undefined;

    const checkWhenWorkspaceIsReady = () => {
      if (generation !== checkGenerationRef.current) return;

      if (document.querySelector(".entry-splash")) {
        timerId = window.setTimeout(checkWhenWorkspaceIsReady, 120);
        return;
      }

      api.me()
        .then(({ user }) => {
          if (generation !== checkGenerationRef.current) return;
          checkedSessionRef.current = true;
          if (!user?.needsOnboardingGuide) return;
          setUserName(user.username || "");
          setGuideOpen(true);
        })
        .catch(() => {
          // App handles expired sessions and backend availability messaging.
        });
    };

    checkWhenWorkspaceIsReady();
    return () => {
      checkGenerationRef.current += 1;
      if (timerId) window.clearTimeout(timerId);
    };
  }, [isAuthRoute]);

  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    api.put("/api/auth/onboarding-guide", {}).catch(() => {
      // Keep the server flag pending so the guide can be offered again later.
    });
  }, []);

  return (
    <PrepMatrixGuideDialog
      onClose={closeGuide}
      open={guideOpen}
      userName={userName}
      variant="onboarding"
    />
  );
}

export default FirstLoginGuideCoordinator;
