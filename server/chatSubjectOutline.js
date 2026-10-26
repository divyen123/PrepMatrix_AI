import { normalizeChatSubjectOutline } from "../src/utils/chatSubjectOutline.js";

const MAX_RESPONSE_CHARACTERS = 150_000;
const INVALID_OUTLINE_NOTE = "I couldn't prepare this outline for import. Ask me to regenerate the chapter and topic list.";

export class ChatSubjectOutlineResponseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ChatSubjectOutlineResponseError";
    this.status = 502;
    this.code = "AI_OUTPUT_INVALID";
  }
}

export function supportsChatSubjectOutlines({
  clientSupportsOutlines = false,
  youngKidsChat = false,
  assistantContext = null,
  hasVisionImages = false,
} = {}) {
  return clientSupportsOutlines === true && !youngKidsChat && !assistantContext && !hasVisionImages;
}

export const CHAT_SUBJECT_OUTLINE_SYSTEM_RULE = [
  "Return one JSON object, with no outer Markdown fence, using exactly these fields: reply and subjectOutline.",
  "reply must be a nonempty string containing your complete readable answer, with Markdown lists and code fences where useful.",
  "subjectOutline must be null for ordinary explanations, code, study status, resource requests, or a clarification question.",
  "Only provide subjectOutline when the student asks for a subject's chapter list, topic list, syllabus, course outline, or asks to revise an outline already discussed. Resolve short follow-ups using conversation history. Do not turn incidental mentions of chapters or topics into a proposed outline.",
  "For a requested outline, subjectOutline has this exact shape: {\"subjectName\":\"Data Structures\",\"difficulty\":\"medium\",\"chapterNames\":[\"Arrays\",\"Linked Lists\"],\"topics\":[\"Traversal\",\"Memory allocation\"]}.",
  "Use a specific, recognizable subject name of at most 160 characters. If the subject cannot be determined from the request or conversation, ask one short clarification and set subjectOutline to null.",
  "Use difficulty easy, medium, or hard; default to medium unless the student chooses a difficulty. Match the verified learner level and curriculum context.",
  "chapterNames and topics are ordered arrays of plain title strings. They are two separate subject lists, not a nested Chapter-to-Topic tree. Never put objects or nested arrays in them. Omit a category only by using an empty array; at least one category must contain entries.",
  "Each chapter or topic title must be 120 characters or fewer. Use unique names, ignoring case and extra spaces, and do not repeat a chapter name as a focus topic. Preserve a sensible learning order.",
  "Keep the outline complete and reasonably sized, usually no more than 20 chapters and 40 focus topics. The absolute limits are 500 chapters and 60 focus topics; if the student requests more, explain the limit and ask them to choose a narrower scope instead of silently cutting the list.",
  "Label generated outlines as AI-suggested in reply; never imply they are an official syllabus. If source material was supplied, explain that the list should be checked against it.",
  "The interface displays an editable outline card and an Add to subject button for a valid subjectOutline. Briefly introduce it in reply; do not duplicate the full list in reply, print raw JSON, claim the subject was already saved, or say a schedule was changed. Saving happens only when the student clicks the button.",
].join(" ");

export function chatSubjectOutlineHistoryText(message) {
  const text = typeof message?.text === "string" ? message.text : "";
  const outline = message?.role === "assistant"
    ? normalizeChatSubjectOutline(message.subjectOutline)
    : null;
  return outline
    ? `${text}\n\n[AI-suggested outline proposal; this does not mean it was saved to Subjects]\n${JSON.stringify(outline)}`
    : text;
}

function invalidResponse() {
  return new ChatSubjectOutlineResponseError(
    "The assistant returned an incomplete response. Please ask again; no subject was changed.",
  );
}

/** Accept readable legacy replies, but never expose a broken JSON envelope as chat text. */
export function parseChatSubjectOutlineResponse(content, {
  enabled = true,
  finishReason = "stop",
} = {}) {
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) throw invalidResponse();

  if (!enabled) return { reply: text, subjectOutline: null };
  if (text.length > MAX_RESPONSE_CHARACTERS || finishReason === "length") {
    throw invalidResponse();
  }

  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/iu);
  const candidate = fenced ? fenced[1].trim() : text;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const resemblesEnvelope = candidate.startsWith("[") || candidate.startsWith("{")
      || /["'](?:reply|subjectOutline)["']\s*:/u.test(candidate)
      || /^```json\b/iu.test(text);
    if (resemblesEnvelope) throw invalidResponse();
    return { reply: text, subjectOutline: null };
  }

  // A plain numeric/boolean answer from an older provider is still readable text.
  if (parsed === null || typeof parsed !== "object") {
    return { reply: typeof parsed === "string" ? parsed.trim() || text : text, subjectOutline: null };
  }
  if (Array.isArray(parsed) || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
    throw invalidResponse();
  }

  const reply = parsed.reply.trim();
  if (parsed.subjectOutline == null) return { reply, subjectOutline: null };

  const subjectOutline = finishReason === "stop" || !finishReason
    ? normalizeChatSubjectOutline(parsed.subjectOutline)
    : null;
  return subjectOutline
    ? { reply, subjectOutline }
    : { reply: `${reply}\n\n${INVALID_OUTLINE_NOTE}`, subjectOutline: null };
}
