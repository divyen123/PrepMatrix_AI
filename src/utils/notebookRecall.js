const COMMON_WORDS = new Set([
  "about", "and", "chapter", "concept", "from", "into", "notes", "overview", "the", "topic", "with",
]);

function lines(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return value ? [String(value).trim()] : [];
}

function titleTerms(value) {
  return [...new Set(String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [])]
    .filter((term) => term.length > 2 && !COMMON_WORDS.has(term));
}

function matchingTitle(sourceTitle, topicTitle) {
  const topicTerms = titleTerms(topicTitle);
  const sourceTerms = new Set(titleTerms(sourceTitle));
  if (!topicTerms.length || !sourceTerms.size) return false;
  return topicTerms.filter((term) => sourceTerms.has(term)).length >= Math.ceil(topicTerms.length * 0.75);
}

function matchingQuestion(question, topicTitle) {
  const title = String(topicTitle || "").trim().toLocaleLowerCase();
  if (title.length < 4) return false;
  return String(question?.question || "").toLocaleLowerCase().includes(title);
}

export function getNotebookRecallCard(notebook, node) {
  if (!node || node.type !== "topic") return null;

  const question = (notebook?.importantQuestions || []).find((item) => matchingQuestion(item, node.title));
  const note = (notebook?.revisedNotes || []).find((item) => matchingTitle(item.title, node.title));
  const outline = [node.explanation || node.summary, ...lines(node.keyPoints)].filter(Boolean);
  const notes = [note?.content, ...lines(note?.keyPoints), ...lines(note?.revisionTips)].filter(Boolean);
  const examples = lines(node.examples).slice(0, 2);
  const applications = lines(node.applications).slice(0, 2);
  const prompt = question?.question
    || `From memory, explain ${node.title} and describe one example or application.`;

  return {
    id: node.id,
    title: node.title,
    chapterName: node.chapterName || "",
    prompt,
    answer: question?.answer || "",
    outline,
    notes,
    examples,
    applications,
  };
}

export function getNotebookRecallTopics(nodes) {
  return (Array.isArray(nodes) ? nodes : []).filter((node) => node?.type === "topic");
}
