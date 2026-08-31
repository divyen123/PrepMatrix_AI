import { FileText } from "lucide-react";

export default function ResumeBuilderIntro({ phase = "playing" }) {
  return (
    <section
      aria-busy="true"
      aria-describedby="resume-builder-intro-description"
      aria-labelledby="resume-builder-intro-title"
      aria-live="polite"
      className={`resume-builder-intro is-${phase}`}
      role="status"
    >
      <div className="resume-builder-intro__glow" aria-hidden="true" />

      <div className="resume-builder-intro__mark" aria-hidden="true">
        <span className="resume-builder-intro__orbit" />
        <span className="resume-builder-intro__orbit is-inner" />
        <span className="resume-builder-intro__spark is-one" />
        <span className="resume-builder-intro__spark is-two" />
        <span className="resume-builder-intro__spark is-three" />
        <FileText size={52} strokeWidth={1.8} />
      </div>

      <div className="resume-builder-intro__copy">
        <span className="resume-builder-intro__reveal resume-builder-intro__eyebrow">
          <span>Career workspace</span>
        </span>
        <h1 className="resume-builder-intro__reveal" id="resume-builder-intro-title">
          <span>Build your story. Present it with confidence.</span>
        </h1>
        <p
          className="resume-builder-intro__reveal"
          id="resume-builder-intro-description"
        >
          <span>
            Shape your experience, education, and skills into a polished, role-ready resume.
          </span>
        </p>
      </div>

      <div className="resume-builder-intro__progress" aria-hidden="true">
        <span />
      </div>
      <span className="resume-builder-intro__status">Preparing Resume Builder…</span>
    </section>
  );
}
