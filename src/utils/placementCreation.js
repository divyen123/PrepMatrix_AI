import { getNotebookPlacementTopics, isCodingPlacementItem } from "./placementPreparation.js";

export const PLACEMENT_CUSTOM_SOURCE_VALUE = "__custom_context__";
export const MAX_PLACEMENT_ROLE_CHARS = 160;
export const MAX_PLACEMENT_TOPIC_CHARS = 140;
export const MAX_PLACEMENT_CREATION_TOPICS = 12;

const ROLE_TOPICS = [
  { match: /\bfull[\s-]?stack\b/iu, coding: true, topics: ["Frontend components and state", "REST API design", "Database queries and transactions", "Authentication and authorization", "Testing a complete application", "Project walkthroughs"] },
  { match: /\bfront[\s-]?end\b|\bweb developer\b|\breact developer\b/iu, coding: true, topics: ["Semantic HTML and accessible interfaces", "CSS layouts and responsiveness", "JavaScript fundamentals and asynchronous code", "Component state and data flow", "API integration and error handling", "Frontend testing and performance"] },
  { match: /\bback[\s-]?end\b|\bserver[\s-]?side\b/iu, coding: true, topics: ["REST API design and validation", "Database queries and transactions", "Authentication and authorization", "Caching and concurrency", "Testing and debugging services", "System design fundamentals"] },
  { match: /\bmobile\b|\bandroid\b|\bios\b|\bflutter\b/iu, coding: true, topics: ["Mobile application lifecycle", "Screen navigation and state", "API integration and offline storage", "Responsive and accessible mobile interfaces", "Testing and debugging mobile applications", "Application performance"] },
  { match: /\bdevops\b|\bsite reliability\b|\bsre\b|\bplatform engineer\b/iu, coding: true, topics: ["Linux and networking fundamentals", "CI/CD pipelines", "Containers and orchestration", "Infrastructure as code", "Monitoring and incident response", "Deployment rollback and reliability"] },
  { match: /\bcloud\b/iu, coding: true, topics: ["Cloud compute and storage", "Identity and access management", "Virtual networks and security", "Scaling and load balancing", "Infrastructure as code", "Monitoring and cost optimization"] },
  { match: /\bcyber[\s-]?security\b|\bsecurity analyst\b|\bpenetration\b/iu, coding: false, topics: ["Network and application security", "Authentication and access controls", "Threat modeling", "Vulnerability assessment", "Incident investigation", "Security monitoring and reporting"] },
  { match: /\bnetwork engineer\b|\bnetwork administrator\b/iu, coding: false, topics: ["TCP/IP and network layers", "Subnetting and IP addressing", "Routing and switching", "DNS and HTTP", "Network troubleshooting", "Network security"] },
  { match: /\bmachine learning\b|\bai engineer\b|\bartificial intelligence\b/iu, coding: true, topics: ["Data preparation and feature engineering", "Supervised learning algorithms", "Model evaluation and data leakage", "Overfitting and regularization", "Model deployment and monitoring", "Explain a machine learning project"] },
  { match: /\bdata scien(?:ce|tist)\b/iu, coding: true, topics: ["Statistics and probability", "Data cleaning and exploratory analysis", "Feature engineering", "Predictive modeling", "Model evaluation and experimentation", "Communicating analytical findings"] },
  { match: /\bdata engineer\b/iu, coding: true, topics: ["SQL queries and transformations", "ETL and data pipelines", "Data modeling and warehousing", "Batch and streaming processing", "Data quality and pipeline testing", "Pipeline reliability and performance"] },
  { match: /\bdatabase\b|\bdba\b/iu, coding: true, topics: ["SQL joins and aggregations", "Database normalization", "Indexes and query execution plans", "Transactions and isolation", "Database backup and recovery", "Database performance tuning"] },
  { match: /\bdata analy(?:st|tics)\b|\bbusiness intelligence\b/iu, coding: true, topics: ["Data cleaning and validation", "SQL joins and aggregations", "Exploratory data analysis", "Statistics and interpreting results", "Dashboards and data visualization", "Presenting actionable insights"] },
  { match: /\bui\b|\bux\b|\bdesign(?:er)?\b/iu, coding: false, topics: ["User research and problem definition", "Information architecture and user flows", "Wireframes and interaction design", "Visual hierarchy and accessible design", "Usability testing", "Portfolio case study walkthroughs"] },
  { match: /\bqa\b|\bquality assurance\b|\btest(?:ing)? engineer\b|\bsdet\b/iu, coding: true, topics: ["Test case design and boundary cases", "Functional and regression testing", "API testing", "Test automation", "Defect investigation and reporting", "Testing strategy for a project"] },
  { match: /\bfinance\b|\bfinancial\b|\baccount(?:ant|ing)\b|\binvestment\b|\baudit\b/iu, coding: false, topics: ["Financial statements and accounting principles", "Financial ratios and business performance", "Budgeting and variance analysis", "Valuation and cash flow", "Risk assessment and internal controls", "Financial case study walkthroughs"] },
  { match: /\bbusiness analyst\b|\bproduct manager\b|\bconsult(?:ant|ing)\b/iu, coding: false, topics: ["Problem framing and stakeholder requirements", "Business process analysis", "Prioritization and trade-offs", "Metrics and interpreting data", "Case study walkthroughs", "Communicating recommendations"] },
  { match: /\bmarket(?:ing)?\b|\bsales\b/iu, coding: false, topics: ["Customer research and segmentation", "Value propositions and positioning", "Campaign planning and channels", "Sales funnel and conversion metrics", "Handling customer objections", "Campaign or sales case studies"] },
  { match: /\bhuman resources\b|\bhr\b|\brecruit(?:er|ment)\b/iu, coding: false, topics: ["Recruitment and interview planning", "Employee onboarding", "Performance and feedback", "Workplace conflict resolution", "HR policies and ethical decisions", "People analytics fundamentals"] },
  { match: /\blaw\b|\blegal\b/iu, coding: false, topics: ["Legal research and statutory interpretation", "Case analysis and argument structure", "Contract fundamentals", "Professional ethics", "Drafting and reviewing legal documents", "Legal case study walkthroughs"] },
  { match: /\bmechanical\b|\bcivil\b|\belectrical\b|\belectronics\b|\bengineering graduate\b/iu, coding: false, topics: ["Core engineering principles", "Engineering calculations and assumptions", "Design and practical applications", "Safety and quality checks", "Troubleshooting technical problems", "Engineering project walkthroughs"] },
  { match: /\bsoftware\b|\bprogrammer\b|\bdeveloper\b|\b(?:dsa|data structures|algorithms)\b/iu, coding: true, topics: ["Programming fundamentals", "Arrays and strings", "Hashing and complexity", "Linked lists and stack/queue operations", "Object-oriented design", "Testing and debugging a project"] },
];

function clean(value, limit = MAX_PLACEMENT_ROLE_CHARS) {
  return String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, limit);
}

export function parsePlacementCreationTopics(value) {
  const rows = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/u);
  const seen = new Set();
  return rows.map((row) => String(row ?? "").trim()).filter((row) => {
    const key = row.normalize("NFKC").toLocaleLowerCase();
    if (!row || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function notebookTopics(notebook) {
  if (!notebook) return [];
  const topics = getNotebookPlacementTopics(notebook, MAX_PLACEMENT_CREATION_TOPICS);
  if (topics.length) return topics;
  const chapters = notebook.chapters || notebook.outline?.chapters || notebook.structure?.chapters || notebook.studyGuide?.chapters || [];
  return parsePlacementCreationTopics((Array.isArray(chapters) ? chapters : []).map((chapter) => clean(chapter?.title || chapter?.name || chapter, MAX_PLACEMENT_TOPIC_CHARS)))
    .slice(0, MAX_PLACEMENT_CREATION_TOPICS);
}

function roleLanguage(role) {
  const languages = [
    [/\btypescript\b/iu, "TypeScript"], [/\bjavascript\b/iu, "JavaScript"],
    [/\bpython\b/iu, "Python"], [/\bjava\b/iu, "Java"],
    [/\bc\+\+/iu, "C++"], [/\bc#|\bc sharp\b/iu, "C#"],
    [/\bkotlin\b/iu, "Kotlin"], [/\bswift\b/iu, "Swift"],
    [/\brust\b/iu, "Rust"], [/\bgolang\b|\bgo developer\b/iu, "Go"],
  ];
  return languages.find(([pattern]) => pattern.test(role))?.[1] || "";
}

function suggestedTopics(role, { notebook, codingRelevant = false } = {}) {
  const savedTopics = notebookTopics(notebook);
  if (savedTopics.length) return savedTopics;
  const target = clean(role);
  const rule = ROLE_TOPICS.find((entry) => entry.match.test(target));
  const roleLabel = clean(target, 90) || "the target role";
  const topics = rule?.topics || [
    `Core responsibilities for ${roleLabel}`,
    `Essential skills for ${roleLabel}`,
    `Practical problem solving for ${roleLabel}`,
    "Project and experience walkthroughs",
    "Interview questions and clear answers",
  ];
  const language = roleLanguage(target);
  if (!(rule?.coding || codingRelevant || language)) return [...topics];
  if (!language) return [...topics];
  // Retain an explicitly requested language without rewriting saved notebook topics.
  return [`${language} fundamentals and a worked coding example`, ...topics.filter((topic) => !/^Programming fundamentals$/u.test(topic))].slice(0, 6);
}

export function getPlacementTopicSuggestion(role, options = {}) {
  return suggestedTopics(role, options).join("\n");
}

export function getPlacementQuickTopics(role, options = {}) {
  return suggestedTopics(role, options).slice(0, 6);
}

export function buildPlacementScope(role, topics) {
  const target = clean(role);
  const requested = parsePlacementCreationTopics(topics);
  const coding = ROLE_TOPICS.find((entry) => entry.match.test(target))?.coding
    || isCodingPlacementItem({ item: target })
    || requested.some((title) => isCodingPlacementItem({ item: title }));
  const language = roleLanguage(target);
  return [
    `Create a detailed placement preparation guide for the target role ${JSON.stringify(target)}.`,
    `Explain exactly these requested topics, in this order: ${JSON.stringify(requested)}. Treat topic titles as learner-specified scope; do not substitute unrelated topics.`,
    "For each topic, define the important terms, explain how and why it works step by step, give a practical real-world example with its reasoning and result, and identify key points, common mistakes, and relevant trade-offs. Answer interview checks directly and explain the suggested practice tasks.",
    coding ? `For each programming-related topic, include a complete runnable worked solution${language ? ` in ${language}` : " in a language suited to that topic"}, explain the code step by step, show sample inputs and expected outputs, and cover time and space complexity and meaningful edge cases. Keep non-coding topics focused on their own subject.` : "Include code when an individual requested topic calls for programming; otherwise use concrete domain examples and explained outcomes.",
    "Keep the learner's exact topic coverage and requested language. Provide accurate, detailed explanations rather than a generic preparation checklist.",
  ].join("\n\n");
}

export function acceptPlacementPlaceholder(event, currentValue, placeholder) {
  if (event.key !== "Tab" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
    || event.isComposing || String(currentValue ?? "").trim() || !String(placeholder ?? "").trim()) return false;
  event.preventDefault();
  return true;
}
