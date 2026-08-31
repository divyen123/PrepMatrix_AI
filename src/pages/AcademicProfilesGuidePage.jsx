import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Layers3,
  Lightbulb,
  LockKeyhole,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "react-toastify";
import AcademicProfileCreateDialog from "../components/AcademicProfileCreateDialog";
import SettingsAcademicProfileDeleteDialog from "../components/SettingsAcademicProfileDeleteDialog";
import {
  describeAcademicProfileSlot,
  getAcademicProfileSlots,
} from "../utils/academicProfileSlots";
import { getAcademicProfileDisplayName } from "../utils/academicProfileNames";
import {
  ACADEMIC_PROFILE_GUIDE_STEPS,
  ACADEMIC_PROFILE_SEPARATE_ITEMS,
  ACADEMIC_PROFILE_SHARED_ITEMS,
} from "../utils/academicProfileGuide";
import "../components/AcademicProfilesGuide.css";

const STEP_ICONS = Object.freeze({
  welcome: Sparkles,
  "profile-a-safe": ShieldCheck,
  "separate-workspaces": Layers3,
  switching: Repeat2,
});

const PROFILE_DELETE_EXIT_MS = 180;

const PROFILE_COPY = Object.freeze({
  a: {
    eyebrow: "Your starting space",
    title: "Profile A",
    summary: "The first academic workspace created with your account. Keep your original subjects and study history here.",
    useFor: "Your main class, degree, examination, or current syllabus.",
    tone: "blue",
  },
  b: {
    eyebrow: "Your second space",
    title: "Profile B",
    summary: "An optional second workspace for a different academic context, with its own learning data and progress.",
    useFor: "A new class, degree, stream, course, certification, or separate exam goal.",
    tone: "violet",
  },
});

function profileKind(profile) {
  return String(profile?.id || "").trim() === "profile-b" ? "b" : "a";
}

function personalizeProfileCopy(value, profileNames) {
  return String(value || "").replace(/Profile A|Profile B/gu, (match) => (
    match === "Profile A" ? profileNames.a : profileNames.b
  ));
}

function personalizeGuideSteps(profileNames) {
  return ACADEMIC_PROFILE_GUIDE_STEPS.map((step) => ({
    ...step,
    label: personalizeProfileCopy(step.label, profileNames),
    title: personalizeProfileCopy(step.title, profileNames),
    summary: personalizeProfileCopy(step.summary, profileNames),
    points: step.points.map((point) => personalizeProfileCopy(point, profileNames)),
    tip: personalizeProfileCopy(step.tip, profileNames),
  }));
}

export default function AcademicProfilesGuidePage({
  academicProfileDeletionRetryTarget = null,
  onCreateAcademicProfile,
  onDeleteAcademicProfile,
  onVisitAcademicProfile,
  userProfile = {},
  workspaceTransitioning = false,
}) {
  const navigate = useNavigate();
  const slots = useMemo(() => getAcademicProfileSlots(userProfile), [userProfile]);
  const [selectedKind, setSelectedKind] = useState(() => profileKind(slots.activeProfile));
  const [activeStep, setActiveStep] = useState(0);
  const [guideFinished, setGuideFinished] = useState(false);
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteProfileSelection, setDeleteProfileSelection] = useState("");
  const [deleteProfileSelectionDataId, setDeleteProfileSelectionDataId] = useState("");
  const [deleteConfirmationStep, setDeleteConfirmationStep] = useState("select");
  const [deleteProfilePassword, setDeleteProfilePassword] = useState("");
  const [deleteProfilePasswordVisible, setDeleteProfilePasswordVisible] = useState(false);
  const [deleteProfileError, setDeleteProfileError] = useState("");
  const [profileDeletionGuidance, setProfileDeletionGuidance] = useState(null);
  const createProfileTriggerRef = useRef(null);
  const deleteProfileButtonRef = useRef(null);
  const deleteProfileDismissTimerRef = useRef(null);
  const promptedDeletionRetryRef = useRef("");
  const profileMutationInFlightRef = useRef(false);
  const profileA = slots.profiles.find((profile) => profile.id === "profile-a");
  const profileB = slots.profiles.find((profile) => profile.id === "profile-b");
  const profileNames = {
    a: getAcademicProfileDisplayName(profileA || { id: "profile-a", label: "Profile A" }),
    b: getAcademicProfileDisplayName(profileB || { id: "profile-b", label: "Profile B" }, 1),
  };
  const personalizedGuideSteps = personalizeGuideSteps(profileNames);
  const selectedCopy = PROFILE_COPY[selectedKind];
  const selectedProfile = slots.profiles.find((profile) => profileKind(profile) === selectedKind);
  const selectedProfileName = profileNames[selectedKind];
  const activeKind = profileKind(slots.activeProfile);
  const step = personalizedGuideSteps[activeStep];
  const StepIcon = STEP_ICONS[step.id] || Sparkles;
  const pendingDeletionProfile = slots.profiles.find((profile) => profile.deletionPending)
    || slots.profiles.find((profile) => (
      profile.id === academicProfileDeletionRetryTarget?.id
      && profile.dataId === academicProfileDeletionRetryTarget?.dataId
    ))
    || null;
  const pendingDeletionKey = pendingDeletionProfile?.dataId || pendingDeletionProfile?.id || "";
  const profileMutationBusy = switchingProfile || deletingProfile || workspaceTransitioning;

  useEffect(() => {
    setSelectedKind(profileKind(slots.activeProfile));
  }, [slots.activeProfile]);

  useEffect(() => () => {
    if (deleteProfileDismissTimerRef.current) {
      window.clearTimeout(deleteProfileDismissTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!pendingDeletionKey) {
      promptedDeletionRetryRef.current = "";
      return;
    }
    if (
      !slots.hasTwoProfiles
      || deleteDialogOpen
      || deletingProfile
      || promptedDeletionRetryRef.current === pendingDeletionKey
    ) return;

    if (deleteProfileDismissTimerRef.current) {
      window.clearTimeout(deleteProfileDismissTimerRef.current);
      deleteProfileDismissTimerRef.current = null;
    }
    promptedDeletionRetryRef.current = pendingDeletionKey;
    setDeleteProfileSelection(pendingDeletionProfile.id);
    setDeleteProfileSelectionDataId(pendingDeletionProfile.dataId);
    setDeleteConfirmationStep("select");
    setDeleteProfilePassword("");
    setDeleteProfilePasswordVisible(false);
    setDeleteProfileError("");
    setDeleteDialogOpen(true);
  }, [
    deleteDialogOpen,
    deletingProfile,
    pendingDeletionKey,
    pendingDeletionProfile,
    slots.hasTwoProfiles,
  ]);

  const chooseStep = (index) => {
    setGuideFinished(false);
    setActiveStep(index);
  };

  const handleProfileTabKeyDown = (event, kind) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const kinds = Object.keys(PROFILE_COPY);
    const currentIndex = kinds.indexOf(kind);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? kinds.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + kinds.length) % kinds.length;
    const nextKind = kinds[nextIndex];
    setSelectedKind(nextKind);
    window.requestAnimationFrame(() => {
      document.getElementById(`academic-profile-${nextKind}-tab`)?.focus();
    });
  };

  const openCreateProfileDialog = (event) => {
    if (!onCreateAcademicProfile) {
      toast.error("Profile creation is unavailable right now.");
      return;
    }
    createProfileTriggerRef.current = event?.currentTarget || null;
    setCreateProfileDialogOpen(true);
  };

  const handleVisitProfile = async (targetProfile) => {
    if (
      !targetProfile?.id
      || targetProfile.id === slots.activeProfile?.id
      || profileMutationInFlightRef.current
      || profileMutationBusy
    ) return;
    if (!onVisitAcademicProfile) {
      toast.error("Profile switching is unavailable right now.");
      return;
    }

    profileMutationInFlightRef.current = true;
    setSwitchingProfile(true);
    try {
      await onVisitAcademicProfile(targetProfile);
      setProfileDeletionGuidance(null);
      toast.success("Now viewing " + getAcademicProfileDisplayName(targetProfile) + ".");
    } catch (error) {
      toast.error(error?.message || "Could not visit " + getAcademicProfileDisplayName(targetProfile) + ".");
    } finally {
      profileMutationInFlightRef.current = false;
      setSwitchingProfile(false);
    }
  };

  const handleProfileAction = async (event) => {
    if (!slots.hasTwoProfiles) {
      openCreateProfileDialog(event);
      return;
    }
    if (!selectedProfile?.id || selectedProfile.id === slots.activeProfile?.id) {
      navigate("/settings", { state: { highlightProfileInstitution: true } });
      return;
    }
    await handleVisitProfile(selectedProfile);
  };

  const handleDeleteProfileSelectionChange = (profileId) => {
    const selected = slots.profiles.find((profile) => profile.id === profileId);
    setDeleteProfileSelection(selected?.id || "");
    setDeleteProfileSelectionDataId(selected?.dataId || "");
    setDeleteConfirmationStep("select");
    setDeleteProfilePassword("");
    setDeleteProfilePasswordVisible(false);
    setDeleteProfileError("");
  };

  const dismissDeleteProfileDialog = () => {
    setDeleteProfilePassword("");
    setDeleteProfilePasswordVisible(false);
    setDeleteProfileError("");
    setDeleteDialogOpen(false);
    if (deleteProfileDismissTimerRef.current) {
      window.clearTimeout(deleteProfileDismissTimerRef.current);
    }
    deleteProfileDismissTimerRef.current = window.setTimeout(() => {
      setDeleteProfileSelection("");
      setDeleteProfileSelectionDataId("");
      setDeleteConfirmationStep("select");
      setDeleteProfilePassword("");
      setDeleteProfilePasswordVisible(false);
      setDeleteProfileError("");
      deleteProfileDismissTimerRef.current = null;
    }, PROFILE_DELETE_EXIT_MS);
  };

  const continueToDeletePasswordConfirmation = () => {
    const selectedProfileForDeletion = slots.profiles.find((profile) => (
      profile.id === deleteProfileSelection
      && profile.dataId === deleteProfileSelectionDataId
    ));
    if (!selectedProfileForDeletion) {
      setDeleteProfileError("Select the academic profile you want to delete.");
      return;
    }
    setDeleteProfilePassword("");
    setDeleteProfilePasswordVisible(false);
    setDeleteProfileError("");
    setDeleteConfirmationStep("password");
  };

  const returnToDeleteProfileSelection = () => {
    if (deletingProfile) return;
    setDeleteConfirmationStep("select");
    setDeleteProfilePassword("");
    setDeleteProfilePasswordVisible(false);
    setDeleteProfileError("");
  };

  const handleRequestDeleteProfile = () => {
    if (
      !slots.hasTwoProfiles
      || profileMutationInFlightRef.current
      || profileMutationBusy
    ) return;
    if (!onDeleteAcademicProfile) {
      toast.error("Profile deletion is unavailable right now.");
      return;
    }

    if (deleteProfileDismissTimerRef.current) {
      window.clearTimeout(deleteProfileDismissTimerRef.current);
      deleteProfileDismissTimerRef.current = null;
    }
    const targetProfile = pendingDeletionProfile || slots.inactiveProfile;
    if (!targetProfile?.id) return;
    setDeleteProfileSelection(targetProfile.id);
    setDeleteProfileSelectionDataId(targetProfile.dataId);
    setDeleteConfirmationStep("select");
    setDeleteProfilePassword("");
    setDeleteProfilePasswordVisible(false);
    setDeleteProfileError("");
    setDeleteDialogOpen(true);
  };

  const handleDeleteAcademicProfile = async (currentPassword = "") => {
    const selectedProfileForDeletion = slots.profiles.find((profile) => (
      profile.id === deleteProfileSelection
      && profile.dataId === deleteProfileSelectionDataId
    ));
    if (!selectedProfileForDeletion && deleteProfileSelection) {
      dismissDeleteProfileDialog();
      toast.error("That profile changed in another tab. Review the current profiles before deleting.");
      return;
    }
    if (
      !slots.hasTwoProfiles
      || !selectedProfileForDeletion?.id
      || profileMutationInFlightRef.current
      || profileMutationBusy
      || !onDeleteAcademicProfile
    ) return;
    if (!currentPassword) {
      setDeleteProfileError("Enter your application password to delete this profile.");
      return;
    }

    profileMutationInFlightRef.current = true;
    setDeletingProfile(true);
    setDeleteProfileError("");
    try {
      await onDeleteAcademicProfile(selectedProfileForDeletion, currentPassword);
      setProfileDeletionGuidance(null);
      toast.success(getAcademicProfileDisplayName(selectedProfileForDeletion) + " deleted.");
      dismissDeleteProfileDialog();
    } catch (error) {
      if (error?.code === "KIDS_PARENT_ACCESS_REQUIRED") {
        const guidance = {
          id: selectedProfileForDeletion.id,
          label: getAcademicProfileDisplayName(selectedProfileForDeletion) || "the child profile",
        };
        setProfileDeletionGuidance(guidance);
        dismissDeleteProfileDialog();
        toast.error(
          "Visit " + guidance.label
            + ", unlock Parent Corner, then return to this guide to delete it.",
        );
      } else {
        const message = error?.message
          || "Could not delete " + getAcademicProfileDisplayName(selectedProfileForDeletion) + ".";
        setDeleteProfilePassword("");
        setDeleteProfileError(message);
        if (![
          "ACADEMIC_PROFILE_PASSWORD_REQUIRED",
          "ACADEMIC_PROFILE_PASSWORD_INCORRECT",
        ].includes(error?.code)) {
          toast.error(message);
        }
      }
    } finally {
      profileMutationInFlightRef.current = false;
      setDeletingProfile(false);
    }
  };

  const profileActionLabel = !slots.hasTwoProfiles
    ? "Create Profile B"
    : selectedProfile?.id === slots.activeProfile?.id
      ? "Open profile settings"
      : switchingProfile || workspaceTransitioning
        ? "Switching..."
        : "Visit " + selectedProfileName;
  return (
    <section className="academic-profiles-page page-stack">
      <header className="academic-profiles-page-header">
        <button
          aria-label="Back to Settings"
          className="academic-profile-guide-back page-back-control"
          onClick={() => navigate("/settings")}
          title="Back to Settings"
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={19} />
        </button>
        <div>
          <span className="academic-profile-guide-kicker">Settings / Academic profiles</span>
          <h1>How Profile A and Profile B work</h1>
          <p>A clear guide to switching between two independent learning workspaces.</p>
        </div>
        <span className="academic-profiles-current-badge">
          <CheckCircle2 aria-hidden="true" size={15} /> Current: {getAcademicProfileDisplayName(slots.activeProfile)}
        </span>
      </header>

      <section className="academic-profiles-hero academic-profile-guide-surface">
        <div className="academic-profiles-hero-copy">
          <span className="academic-profile-guide-kicker"><Sparkles aria-hidden="true" size={14} /> Two profiles, one account</span>
          <h2>Keep different study journeys organized—not mixed together.</h2>
          <p>
            {profileNames.a} and {profileNames.b} let you use one PrepMatrix account for two academic contexts.
            Switching changes the active learning workspace while keeping the other profile safe.
          </p>
          <div className="academic-profiles-hero-actions">
            <a className="academic-profile-guide-button is-primary" href="#profile-explorer">
              Explore profiles <ArrowRight aria-hidden="true" size={15} />
            </a>
            <Link className="academic-profile-guide-button is-secondary" to="/settings/profile">
              View user information
            </Link>
          </div>
        </div>
        <div className="academic-profiles-orbit" aria-label={`${profileNames.a} and ${profileNames.b} are separate workspaces`}>
          <div className="is-a"><strong>A</strong><span>{profileNames.a}</span><small>Workspace one</small></div>
          <span><Repeat2 aria-hidden="true" size={22} /><small>Switch</small></span>
          <div className="is-b"><strong>B</strong><span>{profileNames.b}</span><small>Workspace two</small></div>
        </div>
      </section>

      <section className="academic-profiles-explorer academic-profile-guide-surface" id="profile-explorer">
        <header className="academic-profile-guide-section-heading">
          <div>
            <span className="academic-profile-guide-kicker">Interactive profile catalogue</span>
            <h2>Choose a profile to understand its role</h2>
            <p>These tabs explain the workspace without changing your active profile.</p>
          </div>
          <span>{slots.profiles.length} of 2 profiles configured</span>
        </header>

        <div aria-label="Academic profile catalogue" className="academic-profiles-tabs" role="tablist">
          {Object.entries(PROFILE_COPY).map(([kind, profile]) => {
            const exists = slots.profiles.some((item) => profileKind(item) === kind);
            return (
              <button
                aria-controls="academic-profile-catalogue-panel"
                aria-selected={selectedKind === kind}
                className={`tone-${profile.tone}${selectedKind === kind ? " is-selected" : ""}`}
                id={`academic-profile-${kind}-tab`}
                key={kind}
                onClick={() => setSelectedKind(kind)}
                onKeyDown={(event) => handleProfileTabKeyDown(event, kind)}
                role="tab"
                tabIndex={selectedKind === kind ? 0 : -1}
                type="button"
              >
                <span>{kind.toUpperCase()}</span>
                <div><strong>{profileNames[kind]}</strong><small>{exists ? "Configured" : "Available to create"}</small></div>
                {activeKind === kind ? <em><Check aria-hidden="true" size={12} /> Current</em> : null}
              </button>
            );
          })}
        </div>

        <article
          aria-labelledby={`academic-profile-${selectedKind}-tab`}
          className={`academic-profile-catalogue-panel tone-${selectedCopy.tone}`}
          id="academic-profile-catalogue-panel"
          key={selectedKind}
          role="tabpanel"
        >
          <div className="academic-profile-catalogue-letter">{selectedKind.toUpperCase()}</div>
          <div>
            <span>{selectedCopy.eyebrow}</span>
            <h3>{selectedProfileName}</h3>
            <p>{selectedCopy.summary}</p>
            <dl>
              <div><dt>Best used for</dt><dd>{selectedCopy.useFor}</dd></div>
              <div><dt>Status</dt><dd>{selectedProfile ? "Configured on this account" : "Not created yet"}</dd></div>
              <div><dt>Academic setup</dt><dd>{selectedProfile ? describeAcademicProfileSlot(selectedProfile) || "Ready to configure" : "Choose new academic details when creating it"}</dd></div>
            </dl>
          </div>
          <button
            aria-controls={!slots.hasTwoProfiles ? "academic-profile-create-dialog" : undefined}
            aria-expanded={!slots.hasTwoProfiles ? createProfileDialogOpen : undefined}
            aria-haspopup={!slots.hasTwoProfiles ? "dialog" : undefined}
            className="academic-profile-guide-button is-primary"
            disabled={profileMutationBusy}
            onClick={handleProfileAction}
            type="button"
          >
            {profileActionLabel} <ArrowRight aria-hidden="true" size={15} />
          </button>
        </article>
      </section>

      <section className="academic-profiles-boundaries" aria-label="Shared and separate profile information">
        <article className="academic-profile-guide-surface is-separate">
          <header><Layers3 aria-hidden="true" size={21} /><div><span>Profile-specific</span><h2>What stays separate</h2></div></header>
          <p>The active profile owns its academic context and learning workspace.</p>
          <ul>{ACADEMIC_PROFILE_SEPARATE_ITEMS.map((item) => <li key={item}><CheckCircle2 aria-hidden="true" size={15} />{item}</li>)}</ul>
        </article>
        <article className="academic-profile-guide-surface is-shared">
          <header><LockKeyhole aria-hidden="true" size={21} /><div><span>Account-wide</span><h2>What stays shared</h2></div></header>
          <p>You still sign in once and manage one secure PrepMatrix account.</p>
          <ul>{ACADEMIC_PROFILE_SHARED_ITEMS.map((item) => <li key={item}><CheckCircle2 aria-hidden="true" size={15} />{item}</li>)}</ul>
        </article>
      </section>

      <section className="academic-profiles-walkthrough academic-profile-guide-surface">
        <header className="academic-profile-guide-section-heading">
          <div>
            <span className="academic-profile-guide-kicker">Guided walkthrough</span>
            <h2>Learn the workflow one step at a time</h2>
            <p>Nothing changes automatically while you review this guide.</p>
          </div>
          <span>{activeStep + 1} / {personalizedGuideSteps.length}</span>
        </header>

        <nav aria-label="Academic profile guide steps" className="academic-profiles-walkthrough-nav">
          {personalizedGuideSteps.map((guideStep, index) => (
            <button
              aria-current={activeStep === index ? "step" : undefined}
              className={activeStep === index ? "is-active" : ""}
              key={guideStep.id}
              onClick={() => chooseStep(index)}
              type="button"
            >
              <span>{activeStep > index ? <Check aria-hidden="true" size={14} /> : index + 1}</span>
              {guideStep.label}
            </button>
          ))}
        </nav>

        {guideFinished ? (
          <article aria-live="polite" className="academic-profiles-finished">
            <div><CheckCircle2 aria-hidden="true" size={30} /></div>
            <span>Guide complete</span>
            <h3>You’re ready to use both profiles.</h3>
            <p>Check the Current label before studying, and switch from Settings whenever your learning context changes.</p>
            <div>
              <button className="academic-profile-guide-button is-secondary" onClick={() => chooseStep(0)} type="button">Review again</button>
              <button className="academic-profile-guide-button is-primary" onClick={() => navigate("/settings")} type="button">Return to Settings</button>
            </div>
          </article>
        ) : (
          <article aria-live="polite" className={`academic-profiles-walkthrough-step tone-${step.tone}`} key={step.id}>
            <div className="academic-profiles-walkthrough-icon">
              {createElement(StepIcon, { "aria-hidden": true, size: 27 })}
            </div>
            <div>
              <span>Step {activeStep + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.summary}</p>
              <ul>{step.points.map((point) => <li key={point}><CheckCircle2 aria-hidden="true" size={15} />{point}</li>)}</ul>
              <aside><Lightbulb aria-hidden="true" size={16} /><span>{step.tip}</span></aside>
            </div>
          </article>
        )}

        {!guideFinished ? (
          <footer className="academic-profiles-walkthrough-actions">
            <button
              className="academic-profile-guide-button is-secondary"
              disabled={activeStep === 0}
              onClick={() => chooseStep(Math.max(0, activeStep - 1))}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={15} /> Previous
            </button>
            {activeStep < personalizedGuideSteps.length - 1 ? (
              <button className="academic-profile-guide-button is-primary" onClick={() => chooseStep(activeStep + 1)} type="button">
                Next step <ArrowRight aria-hidden="true" size={15} />
              </button>
            ) : (
              <button className="academic-profile-guide-button is-primary" onClick={() => setGuideFinished(true)} type="button">
                Finish guide <CheckCircle2 aria-hidden="true" size={16} />
              </button>
            )}
          </footer>
        ) : null}
      </section>

      <section className="academic-profiles-faq academic-profile-guide-surface">
        <header className="academic-profile-guide-section-heading">
          <div><span className="academic-profile-guide-kicker">Common questions</span><h2>Before you switch or delete</h2></div>
        </header>
        <div>
          <details>
            <summary>Can I create more than two profiles?<ChevronDown aria-hidden="true" size={17} /></summary>
            <p>No. PrepMatrix supports a maximum of Profile A and Profile B for one account.</p>
          </details>
          <details>
            <summary>Does switching copy or merge my study data?<ChevronDown aria-hidden="true" size={17} /></summary>
            <p>No. The current workspace is saved, then the selected profile's separate workspace is loaded.</p>
          </details>
          <details>
            <summary>What happens if I delete a profile?<ChevronDown aria-hidden="true" size={17} /></summary>
            <p>The selected profile and its owned study data are removed after confirmation. The remaining profile becomes active.</p>
          </details>
        </div>
      </section>

      <footer className="academic-profiles-footer academic-profile-guide-surface">
        <div className="academic-profiles-management-copy">
          <CircleUserRound aria-hidden="true" size={20} />
          <span>
            <strong>Profile controls</strong>
            {slots.hasTwoProfiles ? (
              <small role="note">
                Two academic profiles are saved. Delete one profile before editing academic details.
              </small>
            ) : (
              <small>Create Profile B when you need a separate class, course, or learning path.</small>
            )}
            {profileDeletionGuidance ? (
              <small className="academic-profiles-parent-guidance" role="status">
                Visit <b>{profileDeletionGuidance.label}</b>, unlock Parent Corner,
                then return to this guide to delete it.
              </small>
            ) : null}
          </span>
        </div>
        {slots.hasTwoProfiles ? (
          <div className="academic-profiles-management-actions">
            <button
              className="academic-profile-guide-button is-secondary"
              disabled={profileMutationBusy || Boolean(slots.inactiveProfile?.deletionPending)}
              onClick={() => handleVisitProfile(slots.inactiveProfile)}
              type="button"
            >
              <ArrowRight aria-hidden="true" size={15} />
              {switchingProfile
                ? "Switching..."
                : "Visit " + (getAcademicProfileDisplayName(slots.inactiveProfile) || "other profile")}
            </button>
            <button
              aria-controls="settings-profile-delete-dialog"
              aria-expanded={deleteDialogOpen}
              aria-haspopup="dialog"
              className="academic-profile-guide-button is-danger"
              disabled={profileMutationBusy}
              onClick={handleRequestDeleteProfile}
              ref={deleteProfileButtonRef}
              type="button"
            >
              <Trash2 aria-hidden="true" size={15} />
              {deletingProfile ? "Deleting..." : "Delete profile"}
            </button>
          </div>
        ) : (
          <button
            aria-controls="academic-profile-create-dialog"
            aria-expanded={createProfileDialogOpen}
            aria-haspopup="dialog"
            className="academic-profile-guide-button is-primary"
            disabled={profileMutationBusy}
            onClick={openCreateProfileDialog}
            type="button"
          >
            <UserRoundPlus aria-hidden="true" size={16} /> Create Profile B
          </button>
        )}
      </footer>

      <AcademicProfileCreateDialog
        activeProfile={slots.activeProfile}
        institutionName={userProfile?.institutionName}
        onClose={() => setCreateProfileDialogOpen(false)}
        onCreateAcademicProfile={onCreateAcademicProfile}
        open={createProfileDialogOpen}
        returnFocusRef={createProfileTriggerRef}
      />
      {slots.hasTwoProfiles || deleteProfileSelection ? (
        <SettingsAcademicProfileDeleteDialog
          activeProfileId={slots.activeProfile?.id || ""}
          busy={deletingProfile}
          confirmationStep={deleteConfirmationStep}
          errorMessage={deleteProfileError}
          fallbackFocusRef={createProfileTriggerRef}
          onBack={returnToDeleteProfileSelection}
          onCancel={dismissDeleteProfileDialog}
          onConfirm={handleDeleteAcademicProfile}
          onPasswordChange={(value) => {
            setDeleteProfilePassword(value);
            setDeleteProfileError("");
          }}
          onPasswordVisibilityChange={() => setDeleteProfilePasswordVisible((visible) => !visible)}
          onProceed={continueToDeletePasswordConfirmation}
          onSelectionChange={handleDeleteProfileSelectionChange}
          open={deleteDialogOpen}
          password={deleteProfilePassword}
          passwordVisible={deleteProfilePasswordVisible}
          profiles={slots.profiles}
          returnFocusRef={deleteProfileButtonRef}
          selectedProfileId={deleteProfileSelection}
        />
      ) : null}
    </section>
  );
}
