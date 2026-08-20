import { createElement, useEffect, useMemo, useState } from "react";
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
  UserRoundPlus,
} from "lucide-react";
import { toast } from "react-toastify";
import {
  describeAcademicProfileSlot,
  getAcademicProfileSlots,
} from "../utils/academicProfileSlots";
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
  return String(profile?.label || "").trim().toLocaleLowerCase() === "profile b" ? "b" : "a";
}

export default function AcademicProfilesGuidePage({
  onVisitAcademicProfile,
  userProfile = {},
  workspaceTransitioning = false,
}) {
  const navigate = useNavigate();
  const slots = useMemo(() => getAcademicProfileSlots(userProfile), [userProfile]);
  const [selectedKind, setSelectedKind] = useState(() => profileKind(slots.activeProfile));
  const [activeStep, setActiveStep] = useState(0);
  const [guideFinished, setGuideFinished] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const selectedCopy = PROFILE_COPY[selectedKind];
  const selectedProfile = slots.profiles.find((profile) => profileKind(profile) === selectedKind);
  const activeKind = profileKind(slots.activeProfile);
  const step = ACADEMIC_PROFILE_GUIDE_STEPS[activeStep];
  const StepIcon = STEP_ICONS[step.id] || Sparkles;

  useEffect(() => {
    setSelectedKind(profileKind(slots.activeProfile));
  }, [slots.activeProfile]);

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

  const handleProfileAction = async () => {
    if (!slots.hasTwoProfiles) {
      navigate("/settings", { state: { highlightProfileInstitution: true } });
      return;
    }
    if (!selectedProfile?.id || selectedProfile.id === slots.activeProfile?.id) {
      navigate("/settings", { state: { highlightProfileInstitution: true } });
      return;
    }
    if (!onVisitAcademicProfile) {
      toast.error("Profile switching is unavailable right now.");
      return;
    }

    setSwitchingProfile(true);
    try {
      await onVisitAcademicProfile(selectedProfile);
      toast.success(`Now viewing ${selectedProfile.label}.`);
    } catch (error) {
      toast.error(error?.message || `Could not visit ${selectedProfile.label}.`);
    } finally {
      setSwitchingProfile(false);
    }
  };

  const profileActionLabel = !slots.hasTwoProfiles
    ? "Create Profile B"
    : selectedProfile?.id === slots.activeProfile?.id
      ? "Open profile settings"
      : switchingProfile || workspaceTransitioning
        ? "Switching..."
        : `Visit ${selectedCopy.title}`;

  return (
    <section className="academic-profiles-page page-stack">
      <header className="academic-profiles-page-header">
        <button
          aria-label="Back to Settings"
          className="academic-profile-guide-back"
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
          <CheckCircle2 aria-hidden="true" size={15} /> Current: {slots.activeProfile?.label || "Profile A"}
        </span>
      </header>

      <section className="academic-profiles-hero academic-profile-guide-surface">
        <div className="academic-profiles-hero-copy">
          <span className="academic-profile-guide-kicker"><Sparkles aria-hidden="true" size={14} /> Two profiles, one account</span>
          <h2>Keep different study journeys organized—not mixed together.</h2>
          <p>
            Profile A and Profile B let you use one PrepMatrix account for two academic contexts.
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
        <div className="academic-profiles-orbit" aria-label="Profile A and Profile B are separate workspaces">
          <div className="is-a"><strong>A</strong><span>Profile A</span><small>Workspace one</small></div>
          <span><Repeat2 aria-hidden="true" size={22} /><small>Switch</small></span>
          <div className="is-b"><strong>B</strong><span>Profile B</span><small>Workspace two</small></div>
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
                <div><strong>{profile.title}</strong><small>{exists ? "Configured" : "Available to create"}</small></div>
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
            <h3>{selectedCopy.title}</h3>
            <p>{selectedCopy.summary}</p>
            <dl>
              <div><dt>Best used for</dt><dd>{selectedCopy.useFor}</dd></div>
              <div><dt>Status</dt><dd>{selectedProfile ? "Configured on this account" : "Not created yet"}</dd></div>
              <div><dt>Academic setup</dt><dd>{selectedProfile ? describeAcademicProfileSlot(selectedProfile) || "Ready to configure" : "Choose new academic details when creating it"}</dd></div>
            </dl>
          </div>
          <button
            className="academic-profile-guide-button is-primary"
            disabled={switchingProfile || workspaceTransitioning}
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
          <span>{activeStep + 1} / {ACADEMIC_PROFILE_GUIDE_STEPS.length}</span>
        </header>

        <nav aria-label="Academic profile guide steps" className="academic-profiles-walkthrough-nav">
          {ACADEMIC_PROFILE_GUIDE_STEPS.map((guideStep, index) => (
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
            {activeStep < ACADEMIC_PROFILE_GUIDE_STEPS.length - 1 ? (
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
        <div><CircleUserRound aria-hidden="true" size={20} /><span><strong>Remember:</strong> the Current profile label is your safest checkpoint.</span></div>
        <button className="academic-profile-guide-button is-primary" onClick={() => navigate("/settings")} type="button">
          <UserRoundPlus aria-hidden="true" size={16} /> Manage profiles
        </button>
      </footer>
    </section>
  );
}
