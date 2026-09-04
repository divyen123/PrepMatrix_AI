import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getAcademicProfileExamples } from "./academicProfileExamples.js";

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

const startLearningSource = readSource("../pages/StartLearningPage.jsx");
const notesSource = readSource("../pages/NotesPage.jsx");
const quizSource = readSource("../pages/QuizPage.jsx");
const examSource = readSource("../pages/ExamPage.jsx");
const battlesSource = readSource("../components/quiz-battles/QuizBattlesPanel.jsx");
const appSource = readSource("../App.jsx");
const subjectPlanSource = readSource("../components/SubjectPlanDialog.jsx");
const subjectProgressSource = readSource("../components/SubjectProgressModal.jsx");
const goalTrackerSource = readSource("../components/GoalTracker.jsx");
const analyticsSource = readSource("../pages/AnalyticsPage.jsx");
const topicTimelineSource = readSource("../components/TopicTimeline.jsx");
const kidsLearningSource = readSource("../pages/KidsStartLearningPage.jsx");
const goalReminderSource = readSource("../components/GoalReminderCenter.jsx");
const plannerUnlockSource = readSource("../components/PlannerUnlockQuizDialog.jsx");
const worktreeSource = readSource("../components/WorktreeMapper.jsx");
const resumeSource = readSource("../pages/ResumeBuilderPage.jsx");
const guideSource = readSource("../components/PrepMatrixGuideDialog.jsx");

const contextualUiFields = [
  "subjectPlaceholder",
  "chapterPlaceholder",
  "topicPlaceholder",
  "moreChaptersPlaceholder",
  "learningPromptPlaceholder",
  "examScopePlaceholder",
  "quizTopicPlaceholder",
  "noteTopicPlaceholder",
  "goalTitlePlaceholder",
  "subjectPlanChapterPlaceholder",
  "subjectPlanTopicsPlaceholder",
  "subjectProgressTopicPlaceholder",
  "battleTopicPlaceholder",
  "worktreeNodePlaceholder",
  "resumeHeadlinePlaceholder",
  "resumeExperienceRolePlaceholder",
  "resumeExperienceHighlightsPlaceholder",
  "resumeProjectNamePlaceholder",
  "resumeProjectHighlightsPlaceholder",
  "resumeDegreePlaceholder",
  "resumeFieldPlaceholder",
  "resumeToolsPlaceholder",
  "resumeCourseworkPlaceholder",
  "resumeSkillsPlaceholder",
  "resumeAchievementPlaceholder",
  "placementRolePlaceholder",
  "placementTopicsPlaceholder",
];

test("a switched medical profile supplies medical examples to every curriculum-aware UI field", () => {
  const medical = getAcademicProfileExamples({
    academicLevel: "Medical / Health Sciences",
    academicTrack: "Medical & Health Sciences",
    degree: "BDS",
    department: "Dentistry",
    institutionName: "Priyadharshini Dental College",
  });
  const computing = getAcademicProfileExamples({
    academicLevel: "Undergraduate / Bachelor's",
    academicTrack: "Engineering & Technology",
    degree: "B.Tech",
    department: "Information Technology",
    institutionName: "RMK Engineering College",
  });

  assert.equal(medical.domain, "dentistry");
  assert.equal(computing.domain, "computing");

  for (const field of contextualUiFields) {
    assert.equal(typeof medical[field], "string", `${field} should be display-ready text`);
    assert.ok(medical[field].trim(), `${field} should not be empty`);
    assert.doesNotMatch(
      medical[field],
      /operating systems|cpu scheduling|round-robin|banker's algorithm|react hooks|node\.js|software engineering|data structures/iu,
      `${field} should not leak computing examples into a dentistry profile`,
    );
    assert.notEqual(
      medical[field],
      computing[field],
      `${field} should refresh when the active profile changes curriculum`,
    );
  }
});

test("learning, notes, quizzes, battles, and exams resolve examples from the active profile", () => {
  assert.match(startLearningSource, /getAcademicProfileExamples\(preparationProfile\)/u);
  assert.match(startLearningSource, /placeholder=\{[^\n}]*curriculumExamples\.subjectPlaceholder\}/u);
  assert.match(startLearningSource, /placeholder=\{curriculumExamples\.learningPromptPlaceholder\}/u);

  assert.match(notesSource, /getAcademicProfileExamples\(userProfile\)/u);
  assert.match(notesSource, /placeholder=\{curriculumExamples\.noteTopicPlaceholder\}/u);

  assert.match(quizSource, /getAcademicProfileExamples\(learnerContext\)/u);
  assert.match(quizSource, /academicProfile=\{learnerContext\}/u);
  assert.match(quizSource, /placeholder=\{curriculumExamples\.quizTopicPlaceholder\}/u);

  assert.match(battlesSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(battlesSource, /placeholder=\{curriculumExamples\.battleTopicPlaceholder\}/u);

  assert.match(examSource, /getAcademicProfileExamples\(\{ \.\.\.userProfile, academicLevel, academicTrack \}\)/u);
  assert.match(examSource, /placeholder=\{curriculumExamples\.examScopePlaceholder\}/u);
  assert.match(examSource, /\{codingRelevant && <option value="coding">Coding<\/option>\}/u);
  assert.match(examSource, /\{codingRelevant && \([\s\S]*Coding emphasis/u);
});

  assert.doesNotMatch(examSource, /setCodingMode\("standard"\)/u);
test("subject planning and analytics dialogs receive the same active profile context", () => {
  assert.match(subjectPlanSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(subjectPlanSource, /placeholder=\{curriculumExamples\.subjectPlanChapterPlaceholder\}/u);
  assert.match(subjectPlanSource, /placeholder=\{curriculumExamples\.subjectPlanTopicsPlaceholder\}/u);

  assert.match(subjectProgressSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(subjectProgressSource, /placeholder=\{curriculumExamples\.subjectProgressTopicPlaceholder\}/u);

  assert.match(goalTrackerSource, /getAcademicProfileExamples\(userProfile\)/u);
  assert.match(goalTrackerSource, /curriculumExamples\.subject/u);
  assert.doesNotMatch(goalTrackerSource, /curriculumExamples\.goalKeyword/u);

  assert.match(analyticsSource, /<GoalTracker[^>]*userProfile=\{userProfile\}/u);
  assert.match(analyticsSource, /<TopicTimeline[^>]*userProfile=\{userProfile\}/u);
  assert.match(topicTimelineSource, /<SubjectProgressModal[\s\S]*?academicProfile=\{userProfile\}/u);
  assert.match(appSource, /<AnalyticsPage[\s\S]*?userProfile=\{userProfile\}[\s\S]*?\/>/u);
});

test("kids, goals, guides, and resumes follow the active profile", () => {
  assert.match(kidsLearningSource, /getAcademicProfileExamples\(\{ \.\.\.userProfile, academicLevel, academicTrack \}\)/u);
  assert.match(kidsLearningSource, /placeholder=\{curriculumExamples\.subjectPlaceholder\}/u);
  assert.match(kidsLearningSource, /placeholder=\{curriculumExamples\.topicPlaceholder\}/u);

  assert.match(goalReminderSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(goalReminderSource, /placeholder=\{curriculumExamples\.goalTitlePlaceholder\}/u);
  assert.doesNotMatch(goalReminderSource, /reminderTitlePlaceholder/u);

  assert.match(plannerUnlockSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(plannerUnlockSource, /placeholder=\{topicDetailsPlaceholder\}/u);
  assert.doesNotMatch(plannerUnlockSource, /REST API: HTTP methods|Cloud: IAM and regions/u);

  assert.match(worktreeSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(worktreeSource, /placeholder=\{curriculumExamples\.worktreeNodePlaceholder\}/u);
  assert.doesNotMatch(worktreeSource, /Learn React Hooks|Write unit tests/u);

  assert.match(resumeSource, /getAcademicProfileExamples\(resumeAcademicProfile\)/u);
  assert.match(resumeSource, /resumeExperienceRolePlaceholder/u);
  assert.match(resumeSource, /resumeProjectNamePlaceholder/u);
  assert.match(resumeSource, /resumeDegreePlaceholder/u);
  assert.match(resumeSource, /resumeFieldPlaceholder/u);

  assert.match(guideSource, /getAcademicProfileExamples\(academicProfile\)/u);
  assert.match(guideSource, /such as \$\{curriculumExamples\.subject\}/u);
  assert.doesNotMatch(guideSource, /Mathematics or Data Structures/u);
});

test("active profile data is passed through the application routes to curriculum-aware pages", () => {
  assert.match(appSource, /<NotesPage[\s\S]*?userProfile=\{userProfile\}[\s\S]*?\/>/u);
  assert.match(appSource, /<QuizPage[\s\S]*?userProfile=\{userProfile\}[\s\S]*?\/>/u);
  assert.match(appSource, /<ExamPage[\s\S]*?userProfile=\{userProfile\}[\s\S]*?\/>/u);
  assert.match(appSource, /<GoalReminderCenter[\s\S]*?academicProfile=\{learnerRoutePolicy\.academicProfile\}/u);
  assert.match(appSource, /<Chatbot[\s\S]*?academicProfile=\{learnerRoutePolicy\.academicProfile\}/u);
  assert.match(appSource, /<PlannerPage[\s\S]*?academicProfile=\{learnerRoutePolicy\.academicProfile\}/u);
  assert.match(appSource, /<ResumeBuilderPage[\s\S]*?academicProfile=\{learnerRoutePolicy\.academicProfile\}/u);
  assert.match(appSource, /<ResourcesPage[\s\S]*?academicProfile=\{learnerRoutePolicy\.academicProfile\}/u);
  assert.match(appSource, /<AboutPage academicProfile=\{learnerRoutePolicy\.academicProfile\}/u);
});

test("curriculum-neutral study UI no longer embeds a computing-only fallback example", () => {
  const curriculumNeutralSources = [
    startLearningSource,
    notesSource,
    quizSource,
    examSource,
    battlesSource,
  ].join("\n");

  assert.doesNotMatch(
    curriculumNeutralSources,
    /Travelling salesman problem|e\.g\. Operating Systems|e\.g\. CPU Scheduling|Banker's algorithm|Cell respiration/iu,
  );
});
