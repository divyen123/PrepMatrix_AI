const EXPLICIT_CODING_TOPIC = /(?:\b(?:code|coding|programm(?:ing|er)|implement(?:ation|ing)?|algorithms?|data structures?|dynamic programming|recursion|sql|python|java(?:script)?|typescript|debug(?:ging)?|unit tests?|api|restful|react|node\.js|gcd|factorials?|sorting|search algorithms?)\b|c\+\+|c#)/iu;
const CODING_ROLE = /\b(?:software|developer|programmer|comput(?:ing|er)|data (?:analyst|scientist|engineer)|machine learning|devops|full[\s-]?stack|front[\s-]?end|back[\s-]?end|database)\b/iu;
const CODING_CONTEXT_TOPIC = /\b(?:arrays?|strings?|hash(?:ing|maps?| tables?)?|linked (?:lists?|structures)|stacks?|queues?|trees?|graphs?|loops?|functions?|pointers?|bit manipulation|oop|object[\s-]?oriented|classes|interfaces|prime numbers?|complexity|databases?|web development)\b/iu;
const RUNNABLE_CODE_LANGUAGES = new Set([
  "python", "py", "java", "javascript", "js", "typescript", "ts", "jsx", "tsx",
  "c", "cpp", "c++", "csharp", "c#", "sql", "bash", "sh", "shell", "go",
  "golang", "rust", "rs", "ruby", "rb", "php", "kotlin", "swift", "r", "scala",
  "html", "css", "dart", "matlab",
]);

function topicKey(value) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

export function placementTopicsRequiringCode({ careerEligibility, requestedTopics = [], targetRole = "" }) {
  const codingContext = careerEligibility?.codingRelevant === true || CODING_ROLE.test(targetRole);
  return requestedTopics.filter((title) => (
    EXPLICIT_CODING_TOPIC.test(title) || (codingContext && CODING_CONTEXT_TOPIC.test(title))
  ));
}

function hasText(value, minimum, maximum = Infinity) {
  return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum;
}

function hasCompleteCodeFences(text) {
  const fenceCount = (text.match(/```/gu) || []).length;
  const blocks = [...text.matchAll(/```([^\n`]*)\n([\s\S]*?)\n```/gu)];
  return blocks.length * 2 === fenceCount && blocks.every((match) => match[2].trim().length > 0);
}

function hasRunnableCodeExample(text) {
  return [...text.matchAll(/```([^\n`]*)\n([\s\S]*?)\n```/gu)].some((match) => (
    RUNNABLE_CODE_LANGUAGES.has(match[1].trim().toLocaleLowerCase()) && match[2].trim().length >= 20
  ));
}

// Validate the teaching content before normalization can truncate or relabel it.
// These bounds match the existing saved answer fields and renderer.
export function hasPlacementPreparationOutput(value, expectedTopics = [], requiredCodeTopics = []) {
  if (!value || typeof value !== "object" || !hasText(value.targetRole, 2)
    || !hasText(value.overview, 40, 3000) || !Array.isArray(value.topics)
    || value.topics.length !== expectedTopics.length || !value.topics.length
    || !Array.isArray(value.preparationPlan) || value.preparationPlan.length < 3
    || value.preparationPlan.length > 6) return false;

  const codeTopicKeys = new Set(requiredCodeTopics.map(topicKey));
  const topicIds = new Set();
  const questionIds = new Set();
  const validTopics = value.topics.every((topic, index) => {
    if (!topic || typeof topic !== "object" || !hasText(topic.id, 1)
      || topicIds.has(topic.id) || topicKey(topic.title) !== topicKey(expectedTopics[index])
      || !hasText(topic.explanation, 600, 3000) || !hasText(topic.whyItMatters, 40, 1000)
      || !Array.isArray(topic.interviewQuestions) || topic.interviewQuestions.length < 2
      || topic.interviewQuestions.length > 4 || !Array.isArray(topic.practiceSteps)
      || topic.practiceSteps.length < 4 || topic.practiceSteps.length > 8
      || !topic.practiceSteps.every((step) => hasText(step, 12, 500))) return false;
    topicIds.add(topic.id);
    const validQuestions = topic.interviewQuestions.every((question) => {
      if (!question || !hasText(question.id, 1) || questionIds.has(question.id)
        || !hasText(question.question, 12, 700) || !hasText(question.guidance, 80, 2200)) return false;
      questionIds.add(question.id);
      return true;
    });
    if (!validQuestions) return false;
    const answerTexts = [topic.explanation, topic.whyItMatters,
      ...topic.interviewQuestions.map((question) => question.guidance)];
    return answerTexts.every(hasCompleteCodeFences)
      && (!codeTopicKeys.has(topicKey(topic.title)) || answerTexts.some(hasRunnableCodeExample));
  });
  const phaseIds = new Set();
  return validTopics && value.preparationPlan.every((phase) => {
    if (!phase || !hasText(phase.id, 1) || phaseIds.has(phase.id)
      || !hasText(phase.title, 2, 180) || !hasText(phase.description, 20, 1800)
      || !Array.isArray(phase.actions) || phase.actions.length < 2 || phase.actions.length > 8
      || !phase.actions.every((action) => hasText(action, 8, 500))) return false;
    phaseIds.add(phase.id);
    return true;
  });
}

export function canonicalizePlacementPreparationIds(value) {
  // Provider labels can collide after identifier sanitization or truncation.
  // New analyses have no external ID references, so use short position IDs.
  return {
    ...value,
    topics: value.topics.map((topic, index) => ({
      ...topic,
      id: `career-topic-${index + 1}`,
      interviewQuestions: topic.interviewQuestions.map((question, questionIndex) => ({
        ...question,
        id: `career-topic-${index + 1}-question-${questionIndex + 1}`,
      })),
    })),
    preparationPlan: value.preparationPlan.map((phase, index) => ({
      ...phase,
      id: `preparation-phase-${index + 1}`,
    })),
  };
}

export function buildPlacementPreparationResponseSchema(baseSchema, expectedTopics = []) {
  const schema = structuredClone(baseSchema);
  schema.properties.targetRole.minLength = 2;
  schema.properties.overview.minLength = 40;
  schema.properties.overview.maxLength = 3000;
  const topics = schema.properties.topics;
  topics.minItems = expectedTopics.length;
  topics.maxItems = expectedTopics.length;
  const topic = topics.items.properties;
  topic.title.enum = expectedTopics;
  topic.explanation.minLength = 600;
  topic.explanation.maxLength = 3000;
  topic.whyItMatters.minLength = 40;
  topic.whyItMatters.maxLength = 1000;
  topic.interviewQuestions.minItems = 2;
  topic.interviewQuestions.maxItems = 4;
  const question = topic.interviewQuestions.items.properties;
  question.question.minLength = 12;
  question.question.maxLength = 700;
  question.guidance.minLength = 80;
  question.guidance.maxLength = 2200;
  topic.practiceSteps.minItems = 4;
  topic.practiceSteps.maxItems = 8;
  topic.practiceSteps.items.minLength = 12;
  topic.practiceSteps.items.maxLength = 500;
  const plan = schema.properties.preparationPlan;
  plan.minItems = 3;
  plan.maxItems = 6;
  plan.items.properties.description.minLength = 20;
  plan.items.properties.actions.minItems = 2;
  plan.items.properties.actions.maxItems = 8;
  return schema;
}
