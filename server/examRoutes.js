import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";

const EXAM_QUESTION_COUNT = 40;
const EXAM_DURATION_MINUTES = 60;
const RESULT_DELAY_MS = 72 * 60 * 60 * 1000;
const MAX_VIOLATIONS = 3;
const PAPER_TOTALS = new Set([30, 40, 50, 60, 70, 80, 90, 100]);
const PAPER_MARKS = new Set([1, 3, 4, 5, 10, 15]);
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const PAPER_DIFFICULTIES = new Set(["easy", "medium", "hard", "balanced"]);

function cleanText(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function stripJsonFences(content = "") {
  return cleanText(content)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJsonObject(content = "") {
  const cleaned = stripJsonFences(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("AI response did not contain valid JSON.");
  }
}

function toObjectId(value) {
  const text = cleanText(value);
  return ObjectId.isValid(text) ? new ObjectId(text) : null;
}

function publicId(document) {
  return document?._id?.toString?.() || cleanText(document?.id);
}

function normalizeDifficulty(value, allowed = DIFFICULTIES, fallback = "medium") {
  const difficulty = cleanText(value).toLowerCase();
  return allowed.has(difficulty) ? difficulty : fallback;
}

function normalizeQuestionKey(text) {
  return cleanText(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeExamQuestions(rawQuestions, expectedCount) {
  if (!Array.isArray(rawQuestions)) throw new Error("AI response did not include a questions array.");
  const normalized = rawQuestions.slice(0, expectedCount).map((item) => {
    const question = cleanText(item?.question || item?.text);
    const options = Array.isArray(item?.options)
      ? item.options.map((option) => cleanText(option)).filter(Boolean).slice(0, 4)
      : [];
    const answerIndex = Number(item?.answerIndex);
    const optionKeys = options.map(normalizeQuestionKey);
    if (
      !question
      || options.length !== 4
      || new Set(optionKeys).size !== 4
      || !Number.isInteger(answerIndex)
      || answerIndex < 0
      || answerIndex > 3
    ) {
      throw new Error("AI returned an invalid multiple-choice question.");
    }
    return {
      id: randomUUID(),
      question,
      options,
      answerIndex,
      explanation: cleanText(item?.explanation, "Review the concept and compare all four choices."),
      topic: cleanText(item?.topic, "General"),
      difficulty: normalizeDifficulty(item?.difficulty),
    };
  });
  if (normalized.length !== expectedCount) {
    throw new Error(`AI generated ${normalized.length} questions; expected ${expectedCount}.`);
  }
  const uniqueQuestions = new Set(normalized.map((question) => normalizeQuestionKey(question.question)));
  if (uniqueQuestions.size !== normalized.length) {
    throw new Error("AI returned duplicate multiple-choice questions.");
  }
  return normalized;
}

function sanitizeExamQuestion(question) {
  return {
    id: question.id,
    question: question.question,
    options: question.options,
    topic: question.topic,
    difficulty: question.difficulty,
  };
}

function sanitizeAnswers(rawAnswers, exam) {
  const validIds = new Set((exam?.questions || []).map((question) => question.id));
  return Object.entries(rawAnswers && typeof rawAnswers === "object" ? rawAnswers : {}).reduce((answers, [id, value]) => {
    const index = Number(value);
    if (validIds.has(id) && Number.isInteger(index) && index >= 0 && index <= 3) answers[id] = index;
    return answers;
  }, {});
}

function examMetadata(exam) {
  return {
    id: publicId(exam),
    title: exam.title,
    subjectName: exam.subjectName,
    scopeText: exam.scopeText,
    difficulty: exam.difficulty,
    questionCount: exam.questionCount,
    durationMinutes: exam.durationMinutes,
    status: exam.status,
    createdAt: exam.createdAt,
  };
}

function activeAttemptPayload(attempt, exam) {
  return {
    id: publicId(attempt),
    examId: publicId(exam),
    status: attempt.status,
    title: exam.title,
    subjectName: exam.subjectName,
    scopeText: exam.scopeText,
    difficulty: exam.difficulty,
    questionCount: exam.questionCount,
    durationMinutes: exam.durationMinutes,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    answers: attempt.answers || {},
    violationCount: Number(attempt.violationCount || 0),
    questions: (exam.questions || []).map(sanitizeExamQuestion),
  };
}

function resultSummary(attempt, exam, includeReview = false) {
  const releaseAt = attempt.resultAvailableAt ? new Date(attempt.resultAvailableAt) : null;
  const released = Boolean(releaseAt && releaseAt.getTime() <= Date.now());
  const base = {
    id: publicId(attempt),
    attemptId: publicId(attempt),
    examId: publicId(exam),
    title: exam?.title || "Online exam",
    subjectName: exam?.subjectName || "General",
    difficulty: exam?.difficulty || "medium",
    total: EXAM_QUESTION_COUNT,
    totalQuestions: EXAM_QUESTION_COUNT,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    resultAvailableAt: attempt.resultAvailableAt,
    submissionReason: attempt.submissionReason,
    violationCount: Number(attempt.violationCount || 0),
    locked: !released,
    available: released,
  };
  if (!released) return base;
  const releasedResult = {
    ...base,
    score: Number(attempt.score || 0),
    percentage: Number(attempt.percentage || 0),
    correctCount: Number(attempt.score || 0),
    incorrectCount: Number(attempt.incorrectCount || 0),
    unansweredCount: Number(attempt.unansweredCount || 0),
  };
  if (!includeReview || !exam) return releasedResult;
  releasedResult.questions = (exam.questions || []).map((question) => {
    const selectedIndex = attempt.answers?.[question.id];
    const answered = Number.isInteger(selectedIndex);
    return {
      id: question.id,
      question: question.question,
      options: question.options,
      topic: question.topic,
      difficulty: question.difficulty,
      selectedOptionIndex: answered ? selectedIndex : null,
      selectedAnswer: answered ? question.options[selectedIndex] : null,
      correctOptionIndex: question.answerIndex,
      correctAnswer: question.options[question.answerIndex],
      answer: question.options[question.answerIndex],
      isCorrect: answered && selectedIndex === question.answerIndex,
      explanation: question.explanation,
    };
  });
  return releasedResult;
}

async function requestGroqJson(config, model, { system, prompt, maxTokens = 5000, temperature = 0.18 }) {
  const baseBody = {
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  };
  async function send(body) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
  }
  let result = await send({ ...baseBody, response_format: { type: "json_object" } });
  if (!result.response.ok && result.payload?.error?.code === "failed_generation") result = await send(baseBody);
  if (!result.response.ok) throw new Error(result.payload?.error?.message || "AI generation request failed.");
  return parseJsonObject(result.payload?.choices?.[0]?.message?.content || "");
}

async function generateExamQuestions(config, model, context) {
  const allQuestions = [];
  const seen = new Set();
  for (let batch = 0; batch < 4; batch += 1) {
    let accepted = null;
    for (let attempt = 0; attempt < 2 && !accepted; attempt += 1) {
      const avoid = allQuestions.map((question) => question.question).slice(-30);
      const prompt = [
        `Subject: ${context.subjectName}`,
        `Student level: ${context.academicLevel}`,
        `Board or stream: ${context.academicTrack}`,
        context.department ? `Department: ${context.department}` : "",
        context.scopeText ? `Scope or topics: ${context.scopeText}` : "Scope: broad subject coverage",
        `Difficulty: ${context.difficulty}`,
        `Batch: ${batch + 1} of 4`,
        "Generate exactly 10 unique academic MCQs with four plausible options each.",
        "Test concepts, applications, calculations, code reasoning, or examples appropriate to the subject.",
        "Do not ask about PrepMatrix, planning, study habits, or the application.",
        avoid.length ? `Do not repeat these existing questions: ${JSON.stringify(avoid)}` : "",
        "Return only JSON: {\"questions\":[{\"question\":\"...\",\"options\":[\"...\",\"...\",\"...\",\"...\"],\"answerIndex\":0,\"explanation\":\"...\",\"topic\":\"...\",\"difficulty\":\"easy|medium|hard\"}]}",
      ].filter(Boolean).join("\n");
      try {
        const parsed = await requestGroqJson(config, model, {
          system: "You are a precise secure examination author. Return only valid JSON and follow the requested schema exactly.",
          prompt,
          maxTokens: 5200,
        });
        const candidate = normalizeExamQuestions(parsed.questions, 10);
        const unique = candidate.filter((question) => {
          const key = normalizeQuestionKey(question.question);
          return key && !seen.has(key);
        });
        if (unique.length === 10) accepted = unique;
      } catch {
        // Retry once when the model response is unavailable or malformed.
      }
    }
    if (!accepted) throw new Error(`Could not create 10 unique questions for batch ${batch + 1}.`);
    accepted.forEach((question) => {
      seen.add(normalizeQuestionKey(question.question));
      allQuestions.push(question);
    });
  }
  if (allQuestions.length !== EXAM_QUESTION_COUNT) throw new Error("Exam generation did not produce exactly 40 questions.");
  return allQuestions;
}

async function finalizeAttempt(db, attempt, exam, reason = "manual", answerPatch = null) {
  if (!attempt || !exam || attempt.status !== "in_progress") return attempt;
  const answers = { ...(attempt.answers || {}), ...(answerPatch ? sanitizeAnswers(answerPatch, exam) : {}) };
  const score = (exam.questions || []).reduce((total, question) => total + (answers[question.id] === question.answerIndex ? 1 : 0), 0);
  const answeredCount = Object.keys(answers).length;
  const now = new Date();
  const expiry = attempt.expiresAt ? new Date(attempt.expiresAt) : null;
  const submittedAt = reason === "time_expired"
    && expiry
    && !Number.isNaN(expiry.getTime())
    && expiry.getTime() <= now.getTime()
    ? expiry
    : now;
  const resultAvailableAt = new Date(submittedAt.getTime() + RESULT_DELAY_MS);
  const submissionReason = reason === "violation_limit" || reason === "time_expired" ? reason : "manual";
  const status = submissionReason === "manual" ? "submitted" : "auto_submitted";
  await db.collection("examAttempts").updateOne(
    { _id: attempt._id, userId: attempt.userId, status: "in_progress" },
    { $set: {
      answers,
      score,
      percentage: Math.round((score / EXAM_QUESTION_COUNT) * 100),
      incorrectCount: Math.max(0, answeredCount - score),
      unansweredCount: Math.max(0, EXAM_QUESTION_COUNT - answeredCount),
      status,
      submittedAt,
      resultAvailableAt,
      submissionReason,
      updatedAt: now,
    } },
  );
  return db.collection("examAttempts").findOne({ _id: attempt._id, userId: attempt.userId });
}

async function loadAttemptAndExam(db, userId, attemptId) {
  const objectId = toObjectId(attemptId);
  if (!objectId) return {};
  let attempt = await db.collection("examAttempts").findOne({ _id: objectId, userId });
  if (!attempt) return {};
  const exam = await db.collection("exams").findOne({ _id: attempt.examId, userId });
  if (!exam) return { attempt };
  if (attempt.status === "in_progress" && new Date(attempt.expiresAt).getTime() <= Date.now()) {
    attempt = await finalizeAttempt(db, attempt, exam, "time_expired");
  }
  return { attempt, exam };
}

function normalizeMarkDistribution(body) {
  const raw = body?.markDistribution ?? body?.blueprint ?? body?.sections ?? {};
  const rows = Array.isArray(raw) ? raw : Object.entries(raw && typeof raw === "object" ? raw : {}).map(([marks, count]) => ({ marks, count }));
  const merged = new Map();
  let invalid = false;
  rows.forEach((row) => {
    const marks = Number(row?.marks ?? row?.marksPerQuestion ?? row?.mark);
    const count = Number(row?.count ?? row?.questionCount ?? row?.quantity);
    if (!PAPER_MARKS.has(marks) || !Number.isInteger(count) || count < 0) {
      invalid = true;
      return;
    }
    merged.set(marks, (merged.get(marks) || 0) + count);
  });
  const distribution = [...merged.entries()]
    .map(([marks, count]) => ({ marks, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => a.marks - b.marks);
  return { distribution, invalid };
}

function isCodingSubject(text) {
  return /\b(code|coding|program|programming|computer|software|algorithm|data structure|java|javascript|python|c\+\+|c sharp|react|web|database|sql|artificial intelligence|machine learning|operating system|cloud|network)\b/i.test(text);
}

function recommendedPaperTime(totalMarks, codingHeavy) {
  return Math.min(180, Math.ceil((totalMarks * 1.5 * (codingHeavy ? 1.2 : 1)) / 5) * 5);
}

function normalizePaperQuestions(rawQuestions, maximumCount, marks, sectionTitle) {
  if (!Array.isArray(rawQuestions)) throw new Error("AI response did not include paper questions.");
  const questions = rawQuestions.slice(0, maximumCount).map((item) => {
    const question = cleanText(item?.question || item?.text);
    if (!question) throw new Error("AI returned an empty paper question.");
    const options = Array.isArray(item?.options) ? item.options.map((option) => cleanText(option)).filter(Boolean).slice(0, 4) : [];
    return {
      id: randomUUID(),
      question,
      marks,
      sectionTitle,
      type: cleanText(item?.type, marks === 1 ? "short answer" : "descriptive"),
      topic: cleanText(item?.topic, "General"),
      options: options.length === 4 ? options : undefined,
      modelAnswer: cleanText(item?.modelAnswer || item?.answer, "Answers may vary; award marks for a correct, well-supported response."),
      markingScheme: cleanText(item?.markingScheme, `Award up to ${marks} marks for correctness, method, and clarity.`),
    };
  });
  if (!questions.length) throw new Error("AI did not generate any usable paper questions.");
  return questions;
}

async function generatePaperSection(config, model, context, row, sectionIndex, existingQuestions) {
  const title = `Section ${String.fromCharCode(65 + sectionIndex)} - ${row.marks} mark questions`;
  const questions = [];
  const batchSize = row.marks >= 10 ? 3 : row.marks >= 5 ? 5 : 10;
  while (questions.length < row.count) {
    const count = Math.min(batchSize, row.count - questions.length);
    const prompt = [
      `Subjects: ${context.subjectNames.join(", ")}`,
      `Student level: ${context.academicLevel}`,
      `Board or stream: ${context.academicTrack}`,
      context.department ? `Department: ${context.department}` : "",
      context.scopeText ? `Scope or syllabus: ${context.scopeText}` : "Scope: broad subject coverage",
      `Difficulty: ${context.difficulty}`,
      `Question style: ${context.questionStyle}`,
      `Create exactly ${count} questions worth ${row.marks} marks each for ${title}.`,
      context.codingHeavy
        ? "This is coding-heavy: target about 60 percent of the paper marks for code writing, output prediction, debugging, algorithms, implementation, and complexity reasoning while retaining essential theory."
        : "Use a suitable mix of conceptual, numerical, application, and reasoning questions.",
      context.programmingLanguage ? `Preferred programming language: ${context.programmingLanguage}` : "",
      context.internalChoice ? "Some longer questions may include a clearly labelled internal OR choice within the same mark value." : "",
      existingQuestions.length ? `Avoid repeating these questions: ${JSON.stringify(existingQuestions.slice(-25))}` : "",
      "Return only JSON: {\"questions\":[{\"question\":\"...\",\"type\":\"...\",\"topic\":\"...\",\"options\":[\"optional\",\"optional\",\"optional\",\"optional\"],\"modelAnswer\":\"...\",\"markingScheme\":\"...\"}]}",
    ].filter(Boolean).join("\n");
    const accepted = [];
    for (let attempt = 0; attempt < 5 && accepted.length < count; attempt += 1) {
      const retryPrompt = [
        prompt,
        accepted.length ? `Do not repeat these questions already accepted for this batch: ${JSON.stringify(accepted.map((question) => question.question))}` : "",
        `Variation pass ${attempt + 1}: use different concepts, scenarios, wording, and problem structures.`,
      ].filter(Boolean).join("\n");
      try {
        const parsed = await requestGroqJson(config, model, {
          system: "You are an expert examination paper setter. Return only valid JSON and make each question match its exact mark value.",
          prompt: retryPrompt,
          maxTokens: row.marks >= 10 ? 6000 : 4800,
          temperature: Math.min(0.65, 0.25 + attempt * 0.1),
        });
        const normalized = normalizePaperQuestions(parsed.questions, count, row.marks, title);
        const existing = new Set([
          ...existingQuestions,
          ...questions.map((question) => question.question),
          ...accepted.map((question) => question.question),
        ].map(normalizeQuestionKey));
        for (const question of normalized) {
          const key = normalizeQuestionKey(question.question);
          if (!key || existing.has(key)) continue;
          existing.add(key);
          accepted.push(question);
          if (accepted.length === count) break;
        }
      } catch {
        // Keep accepted questions and regenerate only the missing portion.
      }
    }
    if (accepted.length !== count) throw new Error(`Could not complete ${title} after several variation passes. Please generate the paper again.`);
    questions.push(...accepted);
  }
  return { title, marksPerQuestion: row.marks, count: row.count, questions };
}

export default function registerExamRoutes(app, dependencies) {
  const { getDb, requireAuth, getGroqConfigStatus, groqModel } = dependencies;

  app.post("/api/exams/generate", requireAuth(async (req, res) => {
    try {
      const config = getGroqConfigStatus();
      if (!config.available) return res.status(500).json({ error: config.message });
      const db = await getDb();
      const workspace = await db.collection("workspaces").findOne({ userId: req.user._id });
      const requestedSubject = cleanText(req.body?.subjectName);
      const subject = (workspace?.subjects || []).find((item) => cleanText(item?.name).toLowerCase() === requestedSubject.toLowerCase());
      if (!subject) return res.status(400).json({ error: "Choose a subject saved in your Subjects page." });
      const difficulty = normalizeDifficulty(req.body?.difficulty);
      const context = {
        subjectName: subject.name,
        scopeText: cleanText(req.body?.scopeText || req.body?.topics),
        difficulty,
        academicLevel: cleanText(req.body?.academicLevel, req.user.academicLevel || "College"),
        academicTrack: cleanText(req.body?.academicTrack, req.user.academicTrack || "General"),
        department: cleanText(req.body?.department, req.user.department || ""),
      };
      const questions = await generateExamQuestions(config, groqModel, context);
      const now = new Date();
      const exam = {
        userId: req.user._id,
        title: `${subject.name} - 40 Question Exam`,
        subjectName: subject.name,
        subjectSnapshot: { name: subject.name, chapters: Number(subject.chapters || 0), difficulty: subject.difficulty || "medium" },
        scopeText: context.scopeText,
        academicProfileSnapshot: { academicLevel: context.academicLevel, academicTrack: context.academicTrack, department: context.department },
        difficulty,
        questionCount: EXAM_QUESTION_COUNT,
        durationMinutes: EXAM_DURATION_MINUTES,
        questions,
        model: groqModel,
        status: "ready",
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection("exams").insertOne(exam);
      exam._id = result.insertedId;
      return res.status(201).json({ exam: examMetadata(exam) });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Exam generation failed." });
    }
  }));

  app.get("/api/exams", requireAuth(async (req, res) => {
    const db = await getDb();
    const exams = await db.collection("exams").find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30).toArray();
    res.json({ exams: exams.map(examMetadata) });
  }));

  app.post("/api/exams/:id/start", requireAuth(async (req, res) => {
    const db = await getDb();
    const examId = toObjectId(req.params.id);
    if (!examId) return res.status(404).json({ error: "Exam not found." });
    const exam = await db.collection("exams").findOne({ _id: examId, userId: req.user._id });
    if (!exam) return res.status(404).json({ error: "Exam not found." });
    let attempt = await db.collection("examAttempts").findOne({ userId: req.user._id, examId });
    if (attempt) {
      if (attempt.status === "in_progress" && new Date(attempt.expiresAt).getTime() <= Date.now()) attempt = await finalizeAttempt(db, attempt, exam, "time_expired");
      if (attempt.status !== "in_progress") return res.status(409).json({ error: "This exam has already been submitted.", attempt: resultSummary(attempt, exam) });
      return res.json({ attempt: activeAttemptPayload(attempt, exam) });
    }
    const startedAt = new Date();
    attempt = {
      userId: req.user._id,
      examId,
      status: "in_progress",
      startedAt,
      expiresAt: new Date(startedAt.getTime() + EXAM_DURATION_MINUTES * 60 * 1000),
      answers: {},
      violationCount: 0,
      violations: [],
      createdAt: startedAt,
      updatedAt: startedAt,
    };
    const result = await db.collection("examAttempts").insertOne(attempt);
    attempt._id = result.insertedId;
    await db.collection("exams").updateOne({ _id: examId, userId: req.user._id }, { $set: { status: "started", updatedAt: startedAt } });
    return res.status(201).json({ attempt: activeAttemptPayload(attempt, exam) });
  }));

  app.get("/api/exam-attempts/:id", requireAuth(async (req, res) => {
    const db = await getDb();
    const { attempt, exam } = await loadAttemptAndExam(db, req.user._id, req.params.id);
    if (!attempt || !exam) return res.status(404).json({ error: "Exam attempt not found." });
    return res.json({ attempt: attempt.status === "in_progress" ? activeAttemptPayload(attempt, exam) : resultSummary(attempt, exam, false) });
  }));

  app.put("/api/exam-attempts/:id/answers", requireAuth(async (req, res) => {
    const db = await getDb();
    const { attempt, exam } = await loadAttemptAndExam(db, req.user._id, req.params.id);
    if (!attempt || !exam) return res.status(404).json({ error: "Exam attempt not found." });
    if (attempt.status !== "in_progress") return res.status(409).json({ error: "This exam is no longer active.", attempt: resultSummary(attempt, exam) });
    const answers = sanitizeAnswers(req.body?.answers, exam);
    const updatedAt = new Date();
    await db.collection("examAttempts").updateOne(
      { _id: attempt._id, userId: req.user._id, status: "in_progress" },
      { $set: { answers, updatedAt } },
    );
    return res.json({ attempt: { id: publicId(attempt), status: "in_progress", answers, expiresAt: attempt.expiresAt, violationCount: attempt.violationCount || 0 } });
  }));

  app.post("/api/exam-attempts/:id/violations", requireAuth(async (req, res) => {
    const db = await getDb();
    let { attempt, exam } = await loadAttemptAndExam(db, req.user._id, req.params.id);
    if (!attempt || !exam) return res.status(404).json({ error: "Exam attempt not found." });
    if (attempt.status !== "in_progress") return res.json({ autoSubmitted: true, violationCount: attempt.violationCount || 0, attempt: resultSummary(attempt, exam) });
    const eventId = cleanText(req.body?.eventId);
    const type = cleanText(req.body?.type, "focus_exit");
    if (!eventId) return res.status(400).json({ error: "A violation event ID is required." });
    const duplicate = (attempt.violations || []).some((event) => event.eventId === eventId);
    if (!duplicate) {
      const event = { eventId, type, at: new Date() };
      await db.collection("examAttempts").updateOne(
        {
          _id: attempt._id,
          userId: req.user._id,
          status: "in_progress",
          "violations.eventId": { $ne: eventId },
          $or: [
            { violationCount: { $lt: MAX_VIOLATIONS + 1 } },
            { violationCount: { $exists: false } },
          ],
        },
        { $push: { violations: event }, $inc: { violationCount: 1 }, $set: { updatedAt: event.at } },
      );
      attempt = await db.collection("examAttempts").findOne({ _id: attempt._id, userId: req.user._id });
    }
    if (Number(attempt.violationCount || 0) > MAX_VIOLATIONS) {
      attempt = await finalizeAttempt(db, attempt, exam, "violation_limit", req.body?.answers);
      return res.json({
        autoSubmitted: true,
        violationCount: attempt.violationCount,
        warning: "The fourth focus violation submitted the exam automatically.",
        attempt: resultSummary(attempt, exam),
      });
    }
    return res.json({
      autoSubmitted: false,
      violationCount: Number(attempt.violationCount || 0),
      warning: `Warning ${attempt.violationCount} of 3. A fourth focus violation will submit the exam automatically.`,
      attempt: { id: publicId(attempt), status: attempt.status, violationCount: attempt.violationCount },
    });
  }));

  app.post("/api/exam-attempts/:id/submit", requireAuth(async (req, res) => {
    const db = await getDb();
    let { attempt, exam } = await loadAttemptAndExam(db, req.user._id, req.params.id);
    if (!attempt || !exam) return res.status(404).json({ error: "Exam attempt not found." });
    if (attempt.status === "in_progress") attempt = await finalizeAttempt(db, attempt, exam, cleanText(req.body?.reason, "manual"), req.body?.answers);
    return res.json({ attempt: resultSummary(attempt, exam), result: resultSummary(attempt, exam) });
  }));

  app.get("/api/exam-results", requireAuth(async (req, res) => {
    const db = await getDb();
    const expiredAttempts = await db.collection("examAttempts").find({
      userId: req.user._id,
      status: "in_progress",
      expiresAt: { $lte: new Date() },
    }).toArray();
    if (expiredAttempts.length) {
      const expiredExamIds = [...new Set(expiredAttempts.map((attempt) => attempt.examId?.toString()).filter(Boolean))]
        .map((id) => new ObjectId(id));
      const expiredExams = await db.collection("exams").find({
        _id: { $in: expiredExamIds },
        userId: req.user._id,
      }).toArray();
      const expiredExamMap = new Map(expiredExams.map((exam) => [exam._id.toString(), exam]));
      await Promise.all(expiredAttempts.map((attempt) => {
        const exam = expiredExamMap.get(attempt.examId?.toString());
        return exam ? finalizeAttempt(db, attempt, exam, "time_expired") : Promise.resolve();
      }));
    }
    const attempts = await db.collection("examAttempts").find({ userId: req.user._id, status: { $in: ["submitted", "auto_submitted"] } }).sort({ submittedAt: -1 }).limit(60).toArray();
    const examIds = [...new Set(attempts.map((attempt) => attempt.examId?.toString()).filter(Boolean))].map((id) => new ObjectId(id));
    const exams = examIds.length ? await db.collection("exams").find({ _id: { $in: examIds }, userId: req.user._id }).toArray() : [];
    const examMap = new Map(exams.map((exam) => [exam._id.toString(), exam]));
    return res.json({ results: attempts.map((attempt) => resultSummary(attempt, examMap.get(attempt.examId?.toString()), false)) });
  }));

  app.get("/api/exam-results/:id", requireAuth(async (req, res) => {
    const db = await getDb();
    const { attempt, exam } = await loadAttemptAndExam(db, req.user._id, req.params.id);
    if (!attempt || !exam || !["submitted", "auto_submitted"].includes(attempt.status)) return res.status(404).json({ error: "Exam result not found." });
    return res.json({ result: resultSummary(attempt, exam, true) });
  }));

  app.post("/api/question-papers/generate", requireAuth(async (req, res) => {
    try {
      const config = getGroqConfigStatus();
      if (!config.available) return res.status(500).json({ error: config.message });
      const totalMarks = Number(req.body?.totalMarks);
      if (!PAPER_TOTALS.has(totalMarks)) return res.status(400).json({ error: "Choose total marks from 30 to 100 in steps of 10." });
      const { distribution, invalid: invalidDistribution } = normalizeMarkDistribution(req.body);
      if (invalidDistribution) return res.status(400).json({ error: "Use only supported mark values with non-negative whole-number question counts." });
      const allocated = distribution.reduce((sum, row) => sum + row.marks * row.count, 0);
      if (!distribution.length || allocated !== totalMarks) return res.status(400).json({ error: `The mark distribution must equal exactly ${totalMarks} marks.` });
      const totalQuestions = distribution.reduce((sum, row) => sum + row.count, 0);
      if (totalQuestions > 100) return res.status(400).json({ error: "A paper can contain at most 100 questions." });
      const db = await getDb();
      const workspace = await db.collection("workspaces").findOne({ userId: req.user._id });
      const requestedNames = Array.isArray(req.body?.subjectNames)
        ? req.body.subjectNames.map((name) => cleanText(name)).filter(Boolean)
        : [cleanText(req.body?.subjectName)].filter(Boolean);
      const selectedSubjects = requestedNames.map((requested) =>
        (workspace?.subjects || []).find((subject) => cleanText(subject?.name).toLowerCase() === requested.toLowerCase()),
      );
      if (!selectedSubjects.length || selectedSubjects.some((subject) => !subject)) return res.status(400).json({ error: "Choose subjects saved in your Subjects page." });
      const scopeText = cleanText(req.body?.scopeText || req.body?.topics);
      const codingMode = cleanText(req.body?.codingEmphasis || req.body?.codingMode, "auto").toLowerCase();
      const codingDetected = isCodingSubject([...selectedSubjects.map((subject) => subject.name), scopeText, req.user.department, req.user.academicTrack].join(" "));
      const codingHeavy = codingMode === "high" || codingMode === "coding" || (codingMode === "auto" && codingDetected);
      const difficulty = normalizeDifficulty(req.body?.difficulty, PAPER_DIFFICULTIES, "balanced");
      const context = {
        subjectNames: selectedSubjects.map((subject) => subject.name),
        scopeText,
        codingHeavy,
        difficulty,
        questionStyle: cleanText(req.body?.questionStyle, "mixed"),
        programmingLanguage: cleanText(req.body?.programmingLanguage),
        internalChoice: Boolean(req.body?.internalChoice),
        academicLevel: cleanText(req.body?.academicLevel, req.user.academicLevel || "College"),
        academicTrack: cleanText(req.body?.academicTrack, req.user.academicTrack || "General"),
        department: cleanText(req.body?.department, req.user.department || ""),
      };
      const sections = [];
      const existingQuestions = [];
      for (let index = 0; index < distribution.length; index += 1) {
        const section = await generatePaperSection(config, groqModel, context, distribution[index], index, existingQuestions);
        sections.push(section);
        existingQuestions.push(...section.questions.map((question) => question.question));
      }
      const shuffleQuestions = Boolean(req.body?.shuffleQuestions);
      if (shuffleQuestions) {
        sections.forEach((section) => {
          section.questions = [...section.questions].sort(() => Math.random() - 0.5);
        });
      }
      const questions = sections.flatMap((section) => section.questions);
      const now = new Date();
      const paper = {
        userId: req.user._id,
        title: cleanText(req.body?.paperTitle, `${context.subjectNames.join(" + ")} Question Paper`),
        paperTitle: cleanText(req.body?.paperTitle, `${context.subjectNames.join(" + ")} Question Paper`),
        institutionName: cleanText(req.body?.institutionName, req.user.institutionName || "PrepMatrix AI"),
        subjectNames: context.subjectNames,
        subjectSnapshots: selectedSubjects.map((subject) => ({ name: subject.name, chapters: Number(subject.chapters || 0), difficulty: subject.difficulty || "medium" })),
        scopeText,
        totalMarks,
        recommendedTimeMinutes: recommendedPaperTime(totalMarks, codingHeavy),
        durationMinutes: recommendedPaperTime(totalMarks, codingHeavy),
        difficulty,
        codingMode: codingHeavy ? "coding-heavy" : "standard",
        codingDetected,
        questionStyle: context.questionStyle,
        programmingLanguage: context.programmingLanguage,
        internalChoice: context.internalChoice,
        shuffleQuestions,
        includeAnswerKey: req.body?.includeAnswerKey !== false,
        instructions: cleanText(req.body?.instructions, "Answer every required question. Show working where appropriate."),
        markDistribution: distribution,
        sections,
        questions,
        answerKey: questions.map((question, index) => ({
          questionNumber: index + 1,
          questionId: question.id,
          marks: question.marks,
          modelAnswer: question.modelAnswer,
          markingScheme: question.markingScheme,
        })),
        model: groqModel,
        createdAt: now,
        updatedAt: now,
      };
      const result = await db.collection("questionPapers").insertOne(paper);
      paper._id = result.insertedId;
      const safePaper = { ...paper, id: result.insertedId.toString() };
      delete safePaper._id;
      delete safePaper.userId;
      return res.status(201).json({ paper: safePaper });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : "Question paper generation failed." });
    }
  }));

  app.get("/api/question-papers", requireAuth(async (req, res) => {
    const db = await getDb();
    const papers = await db.collection("questionPapers").find({ userId: req.user._id }).project({ userId: 0, questions: 0, sections: 0, answerKey: 0 }).sort({ createdAt: -1 }).limit(50).toArray();
    return res.json({ papers: papers.map((paper) => ({ ...paper, id: publicId(paper), _id: undefined })) });
  }));

  app.get("/api/question-papers/:id", requireAuth(async (req, res) => {
    const db = await getDb();
    const paperId = toObjectId(req.params.id);
    if (!paperId) return res.status(404).json({ error: "Question paper not found." });
    const paper = await db.collection("questionPapers").findOne({ _id: paperId, userId: req.user._id });
    if (!paper) return res.status(404).json({ error: "Question paper not found." });
    const safePaper = { ...paper, id: publicId(paper) };
    delete safePaper._id;
    delete safePaper.userId;
    return res.json({ paper: safePaper });
  }));

  app.delete("/api/question-papers/:id", requireAuth(async (req, res) => {
    const db = await getDb();
    const paperId = toObjectId(req.params.id);
    if (!paperId) return res.status(404).json({ error: "Question paper not found." });
    const result = await db.collection("questionPapers").deleteOne({ _id: paperId, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: "Question paper not found." });
    return res.json({ ok: true, id: req.params.id });
  }));
}
