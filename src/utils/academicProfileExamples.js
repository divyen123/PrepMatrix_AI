import { normalizeAcademicProfile } from "./academicProfile.js";

const EXAMPLE_SETS = Object.freeze({
  early: {
    subject: "Early Numeracy",
    chapter: "Numbers to 10",
    topic: "Counting objects",
    additionalChapters: ["Shapes around us", "Simple patterns"],
    prompt: "Use a short picture-based activity to practise counting five objects and matching each group to its number.",
    role: "Classroom helper",
    project: "My shapes picture book",
    tools: "Counting, matching, speaking",
  },
  primary: {
    subject: "Science",
    chapter: "Plants and animals",
    topic: "Parts of a plant",
    additionalChapters: ["Living and non-living things", "Our environment"],
    prompt: "Explain the parts of a plant in simple language and include one familiar example and a short practice question.",
    role: "Student activity leader",
    project: "Plant growth observation",
    tools: "Observation, drawing, presentation",
  },
  middle: {
    subject: "Science",
    chapter: "Cells and living systems",
    topic: "Cell structure",
    additionalChapters: ["Force and motion", "Matter and materials"],
    prompt: "Explain cell structure with a clear analogy, compare plant and animal cells, and finish with three recall questions.",
    role: "Science club volunteer",
    project: "Model of a plant cell",
    tools: "Observation, research, presentation",
  },
  secondary: {
    subject: "Mathematics",
    chapter: "Quadratic equations",
    topic: "Factorisation method",
    additionalChapters: ["Coordinate geometry", "Statistics"],
    prompt: "Explain quadratic equations step by step, solve one example by factorisation, and add two board-style practice questions.",
    role: "Peer learning volunteer",
    project: "Mathematics revision guide",
    tools: "Problem solving, data interpretation, presentation",
  },
  senior: {
    subject: "Mathematics",
    chapter: "Functions and relations",
    topic: "Domain and range",
    additionalChapters: ["Probability", "Differential calculus"],
    prompt: "Explain domain and range using graphical and algebraic examples, then include a multi-step board-style problem.",
    role: "Subject club coordinator",
    project: "Senior-school revision portfolio",
    tools: "Analysis, problem solving, presentation",
  },
  seniorScience: {
    subject: "Physics",
    chapter: "Electrostatics",
    topic: "Coulomb's law",
    additionalChapters: ["Current electricity", "Ray optics"],
    prompt: "Explain Coulomb's law, show how direction and magnitude are determined, and solve one board-style numerical problem.",
    role: "STEM club coordinator",
    project: "Electric-field visualization",
    tools: "Scientific reasoning, numerical analysis, laboratory skills",
  },
  seniorCommerce: {
    subject: "Accountancy",
    chapter: "Journal and ledger",
    topic: "Ledger posting",
    additionalChapters: ["Trial balance", "Financial statements"],
    prompt: "Explain ledger posting from journal entries, work through one transaction set, and add a short balancing exercise.",
    role: "Commerce club coordinator",
    project: "Small-business accounts workbook",
    tools: "Accounting, spreadsheet analysis, business communication",
  },
  seniorHumanities: {
    subject: "Political Science",
    chapter: "Constitutional government",
    topic: "Fundamental rights",
    additionalChapters: ["Political institutions", "Citizenship"],
    prompt: "Explain fundamental rights with clear constitutional examples, compare two rights, and include one source-based question.",
    role: "Debate club coordinator",
    project: "Civic awareness presentation",
    tools: "Critical reading, research, public speaking",
  },
  computing: {
    subject: "Operating Systems",
    chapter: "CPU scheduling",
    topic: "Round-robin scheduling",
    additionalChapters: ["Processes and threads", "Memory management"],
    prompt: "Explain process scheduling from first principles, compare common algorithms, and include one worked round-robin example.",
    role: "Software engineering intern",
    project: "Adaptive study planner",
    tools: "Python, JavaScript, data structures, Git",
  },
  engineering: {
    subject: "Engineering Mechanics",
    chapter: "Forces and equilibrium",
    topic: "Free-body diagrams",
    additionalChapters: ["Friction", "Centroids"],
    prompt: "Explain how to draw a free-body diagram, solve one equilibrium problem, and point out common sign-convention mistakes.",
    role: "Engineering trainee",
    project: "Applied engineering design study",
    tools: "Technical drawing, numerical analysis, CAD, teamwork",
  },
  electronics: {
    subject: "Circuit Theory",
    chapter: "Network theorems",
    topic: "Thevenin's theorem",
    additionalChapters: ["AC circuits", "Signals and systems"],
    prompt: "Explain Thevenin's theorem, reduce one circuit step by step, and verify the load current using the equivalent network.",
    role: "Electronics engineering intern",
    project: "Sensor interface prototype",
    tools: "Circuit analysis, simulation, instrumentation, PCB basics",
  },
  dentistry: {
    subject: "Oral Pathology",
    chapter: "Dental caries",
    topic: "Etiology and progression",
    additionalChapters: ["Oral microbiology", "Dental materials"],
    prompt: "Explain the development of dental caries, connect major risk factors to progression, and include an exam-focused prevention summary.",
    role: "Dental intern",
    project: "Oral health awareness project",
    tools: "Clinical observation, patient communication, oral health screening, evidence review",
  },
  medicine: {
    subject: "Human Physiology",
    chapter: "Cardiovascular physiology",
    topic: "Cardiac cycle",
    additionalChapters: ["Respiratory physiology", "Renal physiology"],
    prompt: "Explain the phases of the cardiac cycle, relate pressure changes to valve movement, and include an exam-focused flow diagram.",
    role: "Clinical trainee",
    project: "Clinical case-learning portfolio",
    tools: "Clinical reasoning, patient communication, evidence review, case presentation",
  },
  nursing: {
    subject: "Medical-Surgical Nursing",
    chapter: "Respiratory care",
    topic: "Oxygen therapy",
    additionalChapters: ["Fluid balance", "Infection prevention"],
    prompt: "Explain the principles of oxygen therapy, compare common delivery devices, and include nursing monitoring and safety points.",
    role: "Student nurse",
    project: "Patient-education care plan",
    tools: "Patient assessment, care planning, communication, infection prevention",
  },
  pharmacy: {
    subject: "Pharmacology",
    chapter: "Autonomic nervous system",
    topic: "Beta blockers",
    additionalChapters: ["Pharmacokinetics", "Adverse drug reactions"],
    prompt: "Explain the pharmacological action of beta blockers, compare major classes, and summarize indications and adverse effects academically.",
    role: "Pharmacy trainee",
    project: "Medication-safety literature review",
    tools: "Pharmacology, formulation basics, literature review, medication safety",
  },
  physiotherapy: {
    subject: "Musculoskeletal Physiotherapy",
    chapter: "Shoulder rehabilitation",
    topic: "Rotator cuff function",
    additionalChapters: ["Gait analysis", "Therapeutic exercise"],
    prompt: "Explain rotator cuff function, connect common movement findings to anatomy, and outline an academic rehabilitation progression.",
    role: "Physiotherapy trainee",
    project: "Movement-assessment case portfolio",
    tools: "Functional assessment, anatomy, exercise planning, patient communication",
  },
  publicHealth: {
    subject: "Epidemiology",
    chapter: "Study designs",
    topic: "Cohort studies",
    additionalChapters: ["Measures of disease frequency", "Screening tests"],
    prompt: "Explain cohort studies, compare prospective and retrospective designs, and calculate one simple risk measure.",
    role: "Public health trainee",
    project: "Community health survey",
    tools: "Epidemiology, biostatistics, survey design, health communication",
  },
  law: {
    subject: "Constitutional Law",
    chapter: "Fundamental rights",
    topic: "Judicial review",
    additionalChapters: ["Separation of powers", "Constitutional remedies"],
    prompt: "Explain judicial review, distinguish its constitutional foundations from its limits, and apply the rule to a short hypothetical.",
    role: "Legal research intern",
    project: "Case-law research brief",
    tools: "Legal research, case analysis, drafting, oral advocacy",
  },
  commerce: {
    subject: "Financial Accounting",
    chapter: "Cash flow statements",
    topic: "Operating activities",
    additionalChapters: ["Financial ratios", "Working capital"],
    prompt: "Explain cash flows from operating activities, work through one indirect-method example, and highlight common classification errors.",
    role: "Finance intern",
    project: "Financial performance analysis",
    tools: "Financial analysis, accounting, spreadsheets, presentation",
  },
  business: {
    subject: "Marketing Management",
    chapter: "Market segmentation",
    topic: "Target customer selection",
    additionalChapters: ["Consumer behaviour", "Brand strategy"],
    prompt: "Explain market segmentation, compare useful segmentation bases, and apply them to a concise business case.",
    role: "Business operations intern",
    project: "Market-entry strategy",
    tools: "Market research, business analysis, spreadsheets, presentation",
  },
  naturalScience: {
    subject: "Research Methods",
    chapter: "Experimental design",
    topic: "Variables and controls",
    additionalChapters: ["Measurement and uncertainty", "Data interpretation"],
    prompt: "Explain variables and controls, evaluate a simple experiment, and show how design choices affect the conclusion.",
    role: "Research assistant",
    project: "Experimental research study",
    tools: "Laboratory methods, data analysis, scientific writing, statistics",
  },
  lifeScience: {
    subject: "Molecular Biology",
    chapter: "DNA replication",
    topic: "Leading and lagging strands",
    additionalChapters: ["Gene expression", "Cell signalling"],
    prompt: "Explain DNA replication, compare leading and lagging strand synthesis, and include a labelled process summary.",
    role: "Life-sciences research trainee",
    project: "Molecular biology literature review",
    tools: "Laboratory methods, data analysis, scientific writing, literature review",
  },
  socialScience: {
    subject: "Social Research Methods",
    chapter: "Research design",
    topic: "Qualitative interviews",
    additionalChapters: ["Survey methods", "Ethics in research"],
    prompt: "Explain qualitative interviews, compare structured and semi-structured approaches, and critique one sample research question.",
    role: "Research intern",
    project: "Community research study",
    tools: "Qualitative research, survey design, critical analysis, writing",
  },
  humanities: {
    subject: "Modern History",
    chapter: "Industrial transformation",
    topic: "Social change",
    additionalChapters: ["National movements", "Historical interpretation"],
    prompt: "Explain a major social change during industrial transformation, compare two interpretations, and use evidence to support the conclusion.",
    role: "Editorial or research intern",
    project: "Digital history exhibition",
    tools: "Archival research, critical reading, writing, presentation",
  },
  education: {
    subject: "Learning Theories",
    chapter: "Constructivist learning",
    topic: "Scaffolding",
    additionalChapters: ["Assessment for learning", "Inclusive education"],
    prompt: "Explain scaffolding through a classroom example, compare it with direct instruction, and suggest one formative assessment.",
    role: "Teaching intern",
    project: "Inclusive lesson-plan portfolio",
    tools: "Lesson planning, assessment design, classroom communication, educational research",
  },
  environment: {
    subject: "Environmental Studies",
    chapter: "Ecosystems",
    topic: "Energy flow",
    additionalChapters: ["Biodiversity", "Sustainable resource use"],
    prompt: "Explain energy flow through an ecosystem, interpret one food web, and connect the concept to biodiversity conservation.",
    role: "Sustainability intern",
    project: "Local ecosystem assessment",
    tools: "Field observation, data collection, sustainability analysis, reporting",
  },
  architecture: {
    subject: "Building Design",
    chapter: "Spatial planning",
    topic: "Circulation and zoning",
    additionalChapters: ["Climate-responsive design", "Building materials"],
    prompt: "Explain circulation and zoning, evaluate a simple floor plan, and suggest improvements for function and accessibility.",
    role: "Architecture or design intern",
    project: "Climate-responsive community space",
    tools: "Sketching, CAD, spatial analysis, design communication",
  },
  hospitality: {
    subject: "Hospitality Operations",
    chapter: "Guest service",
    topic: "Service recovery",
    additionalChapters: ["Front-office operations", "Food safety"],
    prompt: "Explain service recovery, apply a clear response framework to a guest scenario, and identify quality-control follow-up steps.",
    role: "Hospitality operations trainee",
    project: "Guest-experience improvement plan",
    tools: "Guest relations, operations, service quality, communication",
  },
  vocational: {
    subject: "Workshop Practice",
    chapter: "Tools and safety",
    topic: "Safe operating procedure",
    additionalChapters: ["Measurement skills", "Preventive maintenance"],
    prompt: "Explain the safe operating procedure for a common workshop task, include a tool checklist, and identify frequent hazards.",
    role: "Technical trainee",
    project: "Workshop safety improvement",
    tools: "Technical operations, measurement, safety practice, troubleshooting",
  },
  professional: {
    subject: "Professional Practice",
    chapter: "Standards and ethics",
    topic: "Applied decision-making",
    additionalChapters: ["Risk management", "Professional communication"],
    prompt: "Explain the relevant professional standard, apply it to a realistic scenario, and justify the safest compliant decision.",
    role: "Professional trainee",
    project: "Standards implementation review",
    tools: "Professional standards, risk analysis, documentation, communication",
  },
  competitive: {
    subject: "Quantitative Aptitude",
    chapter: "Percentages and ratios",
    topic: "Successive percentage change",
    additionalChapters: ["Logical reasoning", "Data interpretation"],
    prompt: "Explain successive percentage change using a fast exam method, solve one timed example, and add two practice questions.",
    role: "Exam preparation coordinator",
    project: "Timed practice and error-analysis tracker",
    tools: "Quantitative reasoning, time management, error analysis, revision planning",
  },
  general: {
    subject: "Academic Foundations",
    chapter: "Core concepts",
    topic: "Applying key principles",
    additionalChapters: ["Evidence and examples", "Review and practice"],
    prompt: "Explain the central concept at my academic level, use one relevant example, and finish with a short self-check activity.",
    role: "Student project contributor",
    project: "Applied learning portfolio",
    tools: "Research, analysis, communication, presentation",
  },
});

function matcherText(...values) {
  return values
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function resolveAcademicProfileExampleDomain(input = {}) {
  const profile = normalizeAcademicProfile(input);
  const profileText = matcherText(
    profile.academicTrack,
    profile.degree,
    profile.department,
  );

  if (profile.band === "early") return "early";
  if (profile.band === "primary") return "primary";
  if (profile.band === "middle") return "middle";
  if (profile.band === "secondary") return "secondary";
  if (profile.band === "senior") {
    if (includesAny(profileText, ["commerce", "business", "account", "finance", "economics"])) return "seniorCommerce";
    if (includesAny(profileText, ["humanities", "arts", "history", "political", "sociology", "psychology", "geography", "literature"])) return "seniorHumanities";
    if (includesAny(profileText, ["science", "stem", "physics", "chemistry", "biology", "math"])) return "seniorScience";
    return "senior";
  }

  if (includesAny(profileText, ["dentistry", "dental", "bds", "m d s"])) return "dentistry";
  if (includesAny(profileText, ["nursing", "bsc nursing", "b sc nursing", "msc nursing", "m sc nursing"])) return "nursing";
  if (includesAny(profileText, ["pharmacy", "pharm d", "b pharm", "m pharm"])) return "pharmacy";
  if (includesAny(profileText, ["physiotherapy", "physical therapy", "bpt", "mpt"])) return "physiotherapy";
  if (includesAny(profileText, ["public health", "epidemiology", "mph", "allied health"])) return "publicHealth";
  if (profile.band === "medical" || includesAny(profileText, ["medical", "medicine", "mbbs", "health sciences", "clinical"])) return "medicine";
  if (profile.band === "law" || includesAny(profileText, ["law", "legal", "llb", "llm", "jurisprudence"])) return "law";

  if (includesAny(profileText, ["education", "teaching", "pedagogy", "b ed", "m ed"])) return "education";
  if (includesAny(profileText, ["computer science", "information technology", "software", "artificial intelligence", "machine learning", "data science", "cybersecurity", "bca", "mca"])) return "computing";
  if (includesAny(profileText, ["electronics", "electrical", "communication engineering", "ece", "eee"])) return "electronics";
  if (includesAny(profileText, ["engineering", "mechanical", "civil", "chemical engineering", "aerospace", "automobile", "b tech", "b e", "m tech"])) return "engineering";

  if (includesAny(profileText, ["biotechnology", "biological science", "biology", "life science", "microbiology", "biochemistry", "genetics"])) return "lifeScience";
  if (includesAny(profileText, ["physics", "chemistry", "mathematics", "statistics", "natural science", "science stem"])) return "naturalScience";
  if (includesAny(profileText, ["accounting", "finance", "commerce", "chartered account", "cfa", "acca", "economics"])) return "commerce";
  if (includesAny(profileText, ["business", "management", "mba", "administration", "marketing", "human resource"])) return "business";
  if (includesAny(profileText, ["agriculture", "environment", "ecology", "forestry", "sustainability"])) return "environment";
  if (includesAny(profileText, ["architecture", "planning", "fine arts", "design", "media", "communication"])) return "architecture";
  if (includesAny(profileText, ["hospitality", "tourism", "hotel management"])) return "hospitality";
  if (includesAny(profileText, ["psychology", "sociology", "political science", "social science", "anthropology"])) return "socialScience";
  if (includesAny(profileText, ["history", "geography", "humanities", "literature", "language", "arts"])) return "humanities";

  if (profile.band === "competitive" || includesAny(profileText, ["competitive", "entrance exam", "upsc", "neet", "jee", "gate", "cat", "civil services"])) return "competitive";
  if (profile.band === "professional" || includesAny(profileText, ["professional", "certification", "certified"])) return "professional";
  if (profile.band === "diploma" || includesAny(profileText, ["diploma", "vocational", "polytechnic", "iti"])) return "vocational";

  return "general";
}

function contextLabel(profile) {
  const qualification = profile.grade || profile.degree || profile.academicLevel;
  const field = profile.department && profile.department !== "General / Undeclared"
    ? profile.department
    : profile.academicTrack !== "General"
      ? profile.academicTrack
      : "";
  return [qualification, field].filter(Boolean).join(" · ");
}

export function getAcademicProfileExamples(input = {}) {
  const profile = normalizeAcademicProfile(input);
  const domain = resolveAcademicProfileExampleDomain(profile);
  const examples = EXAMPLE_SETS[domain] || EXAMPLE_SETS.general;
  const relatedTopics = [examples.topic, ...examples.additionalChapters];
  const fieldLabel = profile.department && profile.department !== "General / Undeclared"
    ? profile.department
    : profile.academicTrack !== "General"
      ? profile.academicTrack
      : profile.degree || profile.academicLevel;
  const learnerLabel = profile.schoolType === "school"
    ? `${profile.grade || profile.academicLevel} student`
    : `${fieldLabel} student`;

  return {
    domain,
    contextLabel: contextLabel(profile),
    subject: examples.subject,
    chapter: examples.chapter,
    topic: examples.topic,
    additionalChapters: [...examples.additionalChapters],
    subjectPlaceholder: `e.g. ${examples.subject}`,
    chapterPlaceholder: `e.g. ${examples.chapter}`,
    topicPlaceholder: `e.g. ${examples.topic}`,
    moreChaptersPlaceholder: examples.additionalChapters.join("\n"),
    learningPromptPlaceholder: `e.g. ${examples.prompt}`,
    examScopePlaceholder: `Example: ${relatedTopics.join(", ")}`,
    quizTopicPlaceholder: `Example: ${examples.topic}`,
    noteTopicPlaceholder: `Example: ${examples.topic}`,
    goalTitlePlaceholder: `Complete the ${examples.subject} revision plan`,
    reminderTitlePlaceholder: `Review ${examples.topic} flashcards`,
    subjectPlanChapterPlaceholder: `e.g. ${examples.chapter}`,
    subjectPlanTopicsPlaceholder: `e.g. ${relatedTopics.join(", ")}`,
    subjectProgressTopicPlaceholder: `Example: ${examples.topic}, ${examples.additionalChapters[0]}`,
    battleTopicPlaceholder: `For example: ${examples.topic}`,
    worktreeNodePlaceholder: `e.g. Review ${examples.topic}, practise ${examples.additionalChapters[0]}`,
    resumeHeadlinePlaceholder: learnerLabel,
    resumeExperienceRolePlaceholder: examples.role,
    resumeExperienceHighlightsPlaceholder: `Applied ${examples.tools.split(",")[0]} in a supervised ${examples.subject} assignment\nDocumented the outcome and presented clear recommendations`,
    resumeProjectNamePlaceholder: examples.project,
    resumeProjectRolePlaceholder: "Student lead and contributor",
    resumeToolsPlaceholder: examples.tools,
    resumeProjectHighlightsPlaceholder: `Planned and completed the ${examples.project}\nUsed ${examples.tools.split(",")[0]} to document findings and improve the final outcome`,
    resumeDegreePlaceholder: profile.degree || profile.grade || "Degree or qualification",
    resumeFieldPlaceholder: fieldLabel,
    resumeCourseworkPlaceholder: `Relevant coursework: ${examples.subject}, ${examples.additionalChapters[0]}`,
    resumeSkillsPlaceholder: examples.tools,
    resumeAchievementPlaceholder: `${examples.subject} project presentation finalist`,
    placementRolePlaceholder: examples.role,
    placementTopicsPlaceholder: relatedTopics.join("\n"),
  };
}

