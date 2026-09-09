import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLearningNotebook } from "./learningNotebook.js";
import {
  CODE_MATRIX_PATH,
  getCodeMatrixEligibility,
  getCodeMatrixSetupSteps,
} from "./codeMatrixProfile.js";

const tertiary = { academicLevel: "Undergraduate / Bachelor's", academicTrack: "General" };
const school = (grade, extra = {}) => ({ academicLevel: "School", grade: `Class ${grade}`, ...extra });
const learningNotebook = {
  id: "notebook-1",
  title: "Loops",
  chapters: [{ title: "Iteration", topics: [{ title: "For loops", explanation: "Repeat a block for each item." }] }],
};

test("exports the requested path and a complete eligibility contract", () => {
  assert.equal(CODE_MATRIX_PATH, "/learn/code-matrix");
  for (const profile of [{}, { ...tertiary, department: "Computer Science" }]) {
    const result = getCodeMatrixEligibility(profile);
    assert.deepEqual(Object.keys(result).sort(), ["defaultLanguage", "eligible", "reason"]);
    assert.equal(typeof result.eligible, "boolean");
    assert.equal(typeof result.reason, "string");
    assert.ok(result.reason.length > 0);
    assert.equal(result.defaultLanguage, "python");
  }
});

test("early years and all primary classes remain excluded despite computing signals", () => {
  for (const profile of [
    { academicLevel: "Early Years / Kindergarten" },
    { academicLevel: "Primary School" },
    { grade: "UKG" },
    ...[1, 3, 4, 5].map((grade) => school(grade, { academicTrack: "Computer Science & IT" })),
  ]) {
    assert.equal(getCodeMatrixEligibility(profile, ["Python"]).eligible, false, JSON.stringify(profile));
  }
});

test("middle, secondary and senior require a computing signal, regardless of board", () => {
  for (const grade of [6, 8, 9, 10, 11, 12]) {
    for (const academicTrack of ["General", "CBSE", "ICSE / ISC", "Science / STEM"]) {
      const profile = school(grade, { academicTrack });
      assert.equal(getCodeMatrixEligibility(profile).eligible, false);
      assert.equal(getCodeMatrixEligibility(profile, [{ name: "Chemistry", chapters: 10 }]).eligible, false);
      assert.equal(getCodeMatrixEligibility(profile, [{ name: "Computer Applications", chapters: 6 }]).eligible, true);
    }
  }
  assert.equal(getCodeMatrixEligibility(school(10, { academicTrack: "Computer Science & IT" })).eligible, true);
});

test("senior computing streams qualify with or without a known class number", () => {
  for (const schoolStream of ["Computer Science / Informatics Practices", "Commerce with Computer Applications"]) {
    for (const profile of [school(11), school(12), { academicLevel: "Senior / Higher Secondary School" }]) {
      assert.equal(getCodeMatrixEligibility({ ...profile, schoolStream }).eligible, true);
    }
  }
  assert.equal(getCodeMatrixEligibility({ academicLevel: "Higher Secondary", stream: "Informatics Practices" }).eligible, true);
  assert.equal(getCodeMatrixEligibility(school(9, { schoolStream: "Computer Science" })).eligible, false);
});

test("Commerce and Arts school electives can establish eligibility", () => {
  for (const schoolStream of ["Commerce", "Commerce with Mathematics", "Humanities / Arts", "Science - PCM"]) {
    const profile = school(12, { schoolStream });
    assert.equal(getCodeMatrixEligibility(profile).eligible, false);
    assert.equal(getCodeMatrixEligibility(profile, [{ name: "Informatics Practices" }]).eligible, true);
  }
});

test("the undergraduate General / Computer Science profile qualifies without subjects", () => {
  assert.equal(getCodeMatrixEligibility({ ...tertiary, department: "Computer Science" }).eligible, true);
});

test("core computing departments, degrees and tracks enable tertiary study", () => {
  const disciplines = [
    "Computer Science", "Information Technology", "Artificial Intelligence & Machine Learning",
    "Data Science & Analytics", "Cybersecurity", "Computer Engineering", "Software Engineering",
    "CS", "CSE", "IT", "AI / ML", "BCA", "MCA", "B.C.A.", "B.Tech (CSE)", "B.Sc. IT",
  ];
  for (const field of ["department", "degree", "academicTrack"]) {
    for (const discipline of disciplines) {
      assert.equal(getCodeMatrixEligibility({ ...tertiary, [field]: discipline }).eligible, true, `${field}: ${discipline}`);
    }
  }
  for (const academicLevel of ["Diploma / Vocational", "Postgraduate / Master's", "Doctoral / Research", "Professional / Certification"]) {
    assert.equal(getCodeMatrixEligibility({ academicLevel, department: "Computer Science" }).eligible, true);
  }
  assert.equal(getCodeMatrixEligibility({ academicLevel: "B.Tech Computer Science" }).eligible, true);
});

test("broad tracks, non-computing departments and generic degrees do not imply coding", () => {
  const disciplines = [
    "Science", "Science / STEM", "Engineering & Technology", "Natural Sciences",
    "Mechanical Engineering", "Civil Engineering", "Chemical Engineering", "Electrical Engineering",
    "Electronics & Communication Engineering", "Mathematics & Statistics", "Physics", "Chemistry",
    "Biotechnology", "Commerce", "Economics", "Business Administration", "Medicine", "Nursing",
    "Law", "Arts & Humanities", "Political Science", "History", "Architecture & Planning",
    "CBSE", "ICSE / ISC", "B.Sc.", "B.Tech", "B.E.", "M.Sc.", "MBA", "MBBS", "LLB",
  ];
  for (const discipline of disciplines) {
    assert.equal(getCodeMatrixEligibility({ ...tertiary, department: discipline, degree: discipline, academicTrack: discipline }).eligible, false, discipline);
  }
});

test("interdisciplinary learners qualify only with explicit computing coursework or degrees", () => {
  for (const department of ["Medicine", "Law", "Commerce", "Psychology", "Agriculture", "Mechanical Engineering"]) {
    const profile = { ...tertiary, department };
    assert.equal(getCodeMatrixEligibility(profile).eligible, false);
    assert.equal(getCodeMatrixEligibility(profile, ["Programming in C"]).eligible, true);
    assert.equal(getCodeMatrixEligibility({ ...profile, course: "Python for Legal Analytics" }).eligible, true);
    assert.equal(getCodeMatrixEligibility({ ...profile, degree: "Diploma in Data Science" }).eligible, true);
  }
  assert.equal(getCodeMatrixEligibility({ academicLevel: "Medical / Health Sciences", courseName: "Data Analysis with Python" }).eligible, true);
  assert.equal(getCodeMatrixEligibility({ academicLevel: "Law / Legal Studies", courses: [{ title: "SQL" }] }).defaultLanguage, "sql");
  assert.equal(getCodeMatrixEligibility(tertiary, [{ name: "Biostatistics", topics: [{ title: "Python programming" }] }]).eligible, true);
});

test("incomplete and malformed profiles remain conservative but accept explicit evidence", () => {
  for (const profile of [undefined, null, {}, false, "Computer Science", { schoolType: "school" }, { academicLevel: "Undergraduate" }]) {
    assert.equal(getCodeMatrixEligibility(profile).eligible, false);
  }
  for (const subjects of [null, {}, "Python", [null, {}, { name: "" }]]) {
    assert.equal(getCodeMatrixEligibility({}, subjects).eligible, false);
  }
  assert.equal(getCodeMatrixEligibility({ department: "Computer Science" }).eligible, true);
  assert.equal(getCodeMatrixEligibility({}, ["Python"]).eligible, true);
  assert.equal(getCodeMatrixEligibility({ fieldOfStudy: "Information Technology", qualification: "B.Sc." }).eligible, true);
});

test("recognizes precise computing, database, web and programming subject titles", () => {
  for (const name of [
    "Computer Science", "Computer Applications", "Information Technology", "Informatics Practices",
    "Computing", "Introduction to Programming", "Programming Fundamentals", "Object-Oriented Programming",
    "Data Structures and Algorithms", "Database Management Systems", "DBMS", "Relational Databases",
    "Web Development", "Web Design", "Web Technologies", "Operating Systems", "Computer Networks",
  ]) {
    assert.equal(getCodeMatrixEligibility(school(10), [{ name }]).eligible, true, name);
  }
  for (const subject of ["Python", { name: "Python" }, { subjectName: "Python" }, { title: "Python" }, { label: "Python" }]) {
    assert.equal(getCodeMatrixEligibility({}, [subject]).eligible, true);
  }
  assert.equal(getCodeMatrixEligibility(tertiary, [{ name: "Methods", chapterNames: ["SQL queries"] }]).eligible, true);
});

test("avoids substring matches and non-programming uses of language names", () => {
  for (const name of [
    "Java history", "History of Java", "Javanese literature", "Python snake biology", "Pythonidae",
    "Chemistry", "Vitamin C", "C major music theory", "Political Science", "British History",
    "It is political history", "Social Science", "Hospitality", "Art History", "Business Administration",
    "TV Programming", "Linear Programming", "Medical Coding", "Web of Life", "Data Collection",
    "C#", "C++ish", "JavaScripture", "NoSQL", "CSSA", "HTMLish",
  ]) {
    const result = getCodeMatrixEligibility(tertiary, [{ name }]);
    assert.equal(result.eligible, false, name);
    assert.equal(result.defaultLanguage, "python", name);
  }
  assert.equal(getCodeMatrixEligibility({ ...tertiary, department: "Java history" }).eligible, false);
});

test("explicit supported languages determine the recommendation, ahead of the board", () => {
  const cases = [
    ["Python", "python"], ["Advanced Python", "python"], ["Python for Finance", "python"],
    ["Python (Advanced)", "python"], ["Java / Python", "java"], ["Python and Java", "python"],
    ["Introduction to C and Java", "c"],
    ["C", "c"], ["Introduction to C", "c"], ["Programming in C", "c"],
    ["C Programming", "c"], ["C++", "cpp"], ["C++ Programming", "cpp"], ["C Plus Plus", "cpp"],
    ["cpp", "cpp"], ["Java", "java"], ["Java Programming", "java"],
    ["JavaScript", "javascript"], ["SQL", "sql"], ["HTML", "html"], ["CSS", "css"],
    ["Database Management Systems", "sql"], ["Structured Query Language", "sql"],
  ];
  for (const [name, expected] of cases) {
    const result = getCodeMatrixEligibility(school(11, { academicTrack: "ICSE / ISC" }), [{ name }]);
    assert.equal(result.eligible, true, name);
    assert.equal(result.defaultLanguage, expected, name);
  }
  assert.equal(getCodeMatrixEligibility(tertiary, ["Ｃ＋＋"]).defaultLanguage, "cpp");
  assert.equal(getCodeMatrixEligibility({ ...tertiary, course: "SQL" }, ["Java"]).defaultLanguage, "sql");
  assert.equal(getCodeMatrixEligibility(tertiary, ["CSS", "HTML"]).defaultLanguage, "css");
});

test("board recommendations need an explicit school board and do not infer a syllabus year", () => {
  for (const board of ["ICSE", "ISC", "ICSE / ISC"]) {
    assert.equal(getCodeMatrixEligibility(school(10, { board }), ["Computer Applications"]).defaultLanguage, "java");
  }
  for (const academicTrack of ["General", "CBSE", "State Board", "Cambridge / IGCSE"]) {
    for (const grade of [6, 10, 12]) {
      assert.equal(getCodeMatrixEligibility(school(grade, { academicTrack }), ["Computer Science"]).defaultLanguage, "python");
    }
  }
  assert.equal(getCodeMatrixEligibility({ ...tertiary, board: "ICSE", department: "Computer Science" }).defaultLanguage, "python");
});

test("setup starts with subjects, then notebook, then plan, recommending only the next gap", () => {
  assert.deepEqual(getCodeMatrixSetupSteps(), [
    { id: "subjects", complete: false, recommended: true },
    { id: "notebook", complete: false, recommended: false },
    { id: "plan", complete: false, recommended: false },
  ]);
  const withSubjects = getCodeMatrixSetupSteps({ subjects: [{ name: "Mathematics", chapters: 4 }] });
  assert.deepEqual(withSubjects.map((step) => step.complete), [true, false, false]);
  assert.equal(withSubjects.find((step) => step.recommended).id, "notebook");
  const withNotebook = getCodeMatrixSetupSteps({ subjects: ["Python"], notebooks: [learningNotebook] });
  assert.deepEqual(withNotebook.map((step) => step.complete), [true, true, false]);
  assert.equal(withNotebook.find((step) => step.recommended).id, "plan");
});

test("empty and malformed collections and placeholder records do not complete setup", () => {
  const expected = getCodeMatrixSetupSteps();
  for (const value of [null, {}, "placeholder", 5]) {
    assert.deepEqual(getCodeMatrixSetupSteps({ subjects: value, notebooks: value, schedule: value, completedSteps: value }), expected);
  }
  assert.deepEqual(getCodeMatrixSetupSteps({
    subjects: [null, {}, { name: " " }, { name: {} }],
    notebooks: [null, {}, { id: "n", title: "Untitled learning notebook" }, {
      id: "outline", title: "Loops", chapters: [{ title: "Chapter 1", topics: [{ title: "Topic 1" }] }],
    }, { chapters: ["Chapter 1"], topics: ["Topic 1"] }, {
      chapters: [{ title: "Chapter 1", topics: [{ title: "Topic 1", subtopics: ["Subtopic 1"] }] }],
    }, normalizeLearningNotebook({}), { ...learningNotebook, isPlaceholder: true }, { ...learningNotebook, placeholder: true }],
    schedule: [null, {}, { day: 1, tasks: [] }, { tasks: [null, {}, { time: "Morning" }, { task: " " }] }],
  }), expected);
});

test("notebook completion reflects study content and ignores placement-only artifacts", () => {
  const complete = (notebook) => getCodeMatrixSetupSteps({ notebooks: [notebook] })[1].complete;
  assert.equal(complete(learningNotebook), true);
  assert.equal(complete({ id: "n", overview: "Loops repeat instructions." }), true);
  assert.equal(complete(normalizeLearningNotebook({ overview: "Loops repeat instructions." })), true);
  assert.equal(complete({ revisedNotes: [{ title: "Loops", content: "Use for to iterate." }] }), true);
  assert.equal(complete({ notes: { sections: [{ keyPoints: ["Each item is visited once."] }] } }), true);
  assert.equal(complete({ topics: [{ title: "Iteration", summary: "Repeat instructions." }] }), true);
  assert.equal(complete({ ...learningNotebook, artifactKind: "placement-workspace" }), false);
  const careerPreparation = { topicAnalysis: { topics: [{ title: "Interview coding", explanation: "Practice." }] } };
  assert.equal(complete({ id: "placement", overview: "Interview preparation", careerPreparation }), false);
  assert.equal(complete(normalizeLearningNotebook(
    { id: "placement", overview: "Interview preparation", careerPreparation },
    { profile: { ...tertiary, department: "Computer Science" } },
  )), false);
  assert.equal(complete({ ...learningNotebook, careerPreparation }), true);
});

test("plan completion requires a usable task, including legacy task strings", () => {
  for (const task of ["Practice loops", { subjectName: "Python", topic: "Loops", task: "Python - Loops" }]) {
    const steps = getCodeMatrixSetupSteps({ schedule: [{ day: 1, tasks: [] }, { day: 2, tasks: [task] }] });
    assert.deepEqual(steps.map((step) => step.complete), [false, false, true]);
    assert.equal(steps.find((step) => step.recommended).id, "subjects");
  }
  assert.equal(getCodeMatrixSetupSteps({ schedule: [{ tasks: [null, { task: 123 }, { task: {} }, " "] }] })[2].complete, false);
});

test("remembered completed IDs survive missing data and combine with observed progress", () => {
  const steps = getCodeMatrixSetupSteps({ completedSteps: ["subjects", "plan", "unknown", "subjects"] });
  assert.deepEqual(steps, [
    { id: "subjects", complete: true, recommended: false },
    { id: "notebook", complete: false, recommended: true },
    { id: "plan", complete: true, recommended: false },
  ]);
  const completed = getCodeMatrixSetupSteps({ notebooks: [learningNotebook], completedSteps: ["subjects", "plan"] });
  assert.ok(completed.every((step) => step.complete && !step.recommended));
  assert.deepEqual(getCodeMatrixSetupSteps({ completedSteps: ["notebook"] }).map((step) => step.complete), [false, true, false]);
});

test("functions are deterministic, do not mutate input, and return fresh setup records", () => {
  const freeze = (value) => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const profile = freeze({ ...tertiary, department: "Law", courses: [{ title: "SQL" }] });
  const input = freeze({
    subjects: [{ name: "Law", topics: [{ title: "SQL" }] }],
    notebooks: [learningNotebook],
    schedule: [{ day: 1, tasks: [{ task: "SQL - SELECT" }] }],
    completedSteps: [],
  });
  const before = JSON.stringify({ profile, input });
  assert.deepEqual(getCodeMatrixEligibility(profile, input.subjects), getCodeMatrixEligibility(profile, input.subjects));
  const steps = getCodeMatrixSetupSteps(input);
  assert.ok(steps.every((step) => step.complete && !step.recommended));
  assert.deepEqual(steps, getCodeMatrixSetupSteps(input));
  steps[0].complete = false;
  assert.equal(getCodeMatrixSetupSteps(input)[0].complete, true);
  assert.equal(JSON.stringify({ profile, input }), before);
});
