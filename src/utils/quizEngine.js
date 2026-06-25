function getLevelTone(academicLevel) {
  if (academicLevel === "College") {
    return "college-level";
  }

  const classNumber = Number(academicLevel.replace("Class ", ""));

  if (classNumber <= 5) {
    return "foundation";
  }

  if (classNumber <= 8) {
    return "middle-school";
  }

  if (classNumber <= 10) {
    return "board-exam";
  }

  return "senior-secondary";
}

function makeQuiz({ topic, subjectName, academicLevel, academicTrack, department }) {
  const cleanTopic = topic.trim() || "the selected topic";
  const cleanSubject = subjectName || "General study";
  const levelTone = getLevelTone(academicLevel);
  const audience = academicLevel === "College" && department
    ? `${department} students`
    : `${academicLevel} students`;

  return [
    {
      id: "concept",
      question: `For ${audience}, what is the best first step when learning ${cleanTopic} in ${cleanSubject}?`,
      options: [
        "Memorize answers without understanding the idea",
        "Understand the core meaning, then solve one simple example",
        "Skip basics and only read advanced notes",
        "Wait until the exam week to start",
      ],
      answerIndex: 1,
      explanation: `At ${levelTone} depth, PrepMatrix recommends concept clarity first, then examples and practice.`,
    },
    {
      id: "application",
      question: `Which activity checks whether you can apply ${cleanTopic}?`,
      options: [
        "Reading the heading repeatedly",
        "Solving a new question and explaining each step",
        "Only highlighting the textbook",
        "Closing the notebook after one definition",
      ],
      answerIndex: 1,
      explanation: "Application is visible when you can solve a fresh problem and explain the reasoning.",
    },
    {
      id: "revision",
      question: `What is the smartest revision method for ${cleanTopic}?`,
      options: [
        "One quick reread with no recall",
        "Active recall, short notes, and mixed practice",
        "Copying the same paragraph many times",
        "Ignoring mistakes after practice",
      ],
      answerIndex: 1,
      explanation: "Active recall and mixed practice reveal weak points faster than passive rereading.",
    },
    {
      id: "mistake",
      question: `If you keep making mistakes in ${cleanTopic}, what should you do next?`,
      options: [
        "Mark it as solved and move on",
        "Find the exact subtopic causing errors and schedule a repair session",
        "Delete the subject from the plan",
        "Only watch unrelated videos",
      ],
      answerIndex: 1,
      explanation: "A targeted repair session turns mistakes into a specific planner task.",
    },
    {
      id: "strategy",
      question: `For ${academicTrack} mode, how should PrepMatrix place ${cleanTopic} in your plan?`,
      options: [
        "Never schedule it if it feels difficult",
        "Place it earlier if it is hard, high-weight, or repeatedly missed",
        "Keep it only for the final day",
        "Schedule it randomly without checking progress",
      ],
      answerIndex: 1,
      explanation: "Hard or high-weight topics should appear earlier so revision has enough recovery time.",
    },
  ];
}

export { makeQuiz };
