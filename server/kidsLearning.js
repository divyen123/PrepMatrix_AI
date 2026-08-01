import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export const KIDS_ATTEMPTS_COLLECTION = "kidsAttempts";
export const KIDS_PARENT_SETTINGS_COLLECTION = "kidsParentSettings";
export const KIDS_CONTENT_VERSION = "2026.08.01";

export const KIDS_GRADE_BANDS = Object.freeze([
  "early-years",
  "class1-2",
  "class3-5",
]);
export const KIDS_SUBJECTS = Object.freeze([
  "English",
  "Maths",
  "EVS",
  "Science",
  "GK",
  "Social",
]);
export const KIDS_GAME_TYPES = Object.freeze([
  "picture-choice",
  "listen-pick",
  "count-tap",
  "match-pairs",
  "sort",
  "sequence",
  "word-scramble",
  "mcq",
]);

const GRADE_BAND_SET = new Set(KIDS_GRADE_BANDS);
const SUBJECT_SET = new Set(KIDS_SUBJECTS);
const GAME_TYPE_SET = new Set(KIDS_GAME_TYPES);
const LANGUAGE_SET = new Set(["en", "hi"]);
const ATTEMPT_MODE_SET = new Set(["game", "daily", "boss", "retry"]);
const PIN_PATTERN = /^\d{4,6}$/u;
const CLIENT_ATTEMPT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/u;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export class KidsLearningValidationError extends Error {
  constructor(message, { code = "KIDS_INVALID_REQUEST", status = 400 } = {}) {
    super(message);
    this.name = "KidsLearningValidationError";
    this.code = code;
    this.status = status;
  }
}

function validationError(message, options) {
  throw new KidsLearningValidationError(message, options);
}

function choice(id, label, visual = "") {
  return { id, label, ...(visual ? { visual } : {}) };
}

function tapItem(id, label, visual) {
  return { id, label, visual };
}

// Curated, reviewable content only. Answers stay server-side and are removed by
// publicKidsPack before any pack reaches a child-facing client.
export const KIDS_CURATED_PACKS = Object.freeze([
  {
    id: "early-english-letter-safari",
    title: "Letter Safari",
    description: "Spot letters by matching them with friendly pictures.",
    gradeBand: "early-years",
    subject: "English",
    gameType: "picture-choice",
    topic: "Letters and beginning sounds",
    difficulty: "starter",
    estimatedMinutes: 4,
    items: [
      {
        id: "letter-a",
        prompt: "Which picture starts with A?",
        visual: "🔤",
        options: [choice("apple", "Apple", "🍎"), choice("ball", "Ball", "⚽"), choice("cat", "Cat", "🐱")],
        answer: "apple",
        explanation: "Apple starts with the /a/ sound.",
      },
      {
        id: "letter-b",
        prompt: "Which picture starts with B?",
        visual: "🔤",
        options: [choice("fish", "Fish", "🐟"), choice("banana", "Banana", "🍌"), choice("sun", "Sun", "☀️")],
        answer: "banana",
        explanation: "Banana starts with the /b/ sound.",
      },
      {
        id: "letter-c",
        prompt: "Which picture starts with C?",
        visual: "🔤",
        options: [choice("cat", "Cat", "🐱"), choice("moon", "Moon", "🌙"), choice("tree", "Tree", "🌳")],
        answer: "cat",
        explanation: "Cat starts with the /c/ sound.",
      },
    ],
  },
  {
    id: "early-english-listening-garden",
    title: "Listening Garden",
    description: "Listen to a word and choose the matching picture.",
    gradeBand: "early-years",
    subject: "English",
    gameType: "listen-pick",
    topic: "Listening and everyday words",
    difficulty: "starter",
    estimatedMinutes: 4,
    items: [
      {
        id: "listen-dog",
        prompt: "Listen and pick the picture.",
        audioText: "Dog",
        options: [choice("dog", "Dog", "🐶"), choice("frog", "Frog", "🐸"), choice("bird", "Bird", "🐦")],
        answer: "dog",
        explanation: "This is a dog.",
      },
      {
        id: "listen-moon",
        prompt: "Listen and pick the picture.",
        audioText: "Moon",
        options: [choice("star", "Star", "⭐"), choice("moon", "Moon", "🌙"), choice("cloud", "Cloud", "☁️")],
        answer: "moon",
        explanation: "This is the moon.",
      },
      {
        id: "listen-bus",
        prompt: "Listen and pick the picture.",
        audioText: "Bus",
        options: [choice("car", "Car", "🚗"), choice("train", "Train", "🚆"), choice("bus", "Bus", "🚌")],
        answer: "bus",
        explanation: "This is a bus.",
      },
    ],
  },
  {
    id: "early-maths-counting-stars",
    title: "Counting Stars",
    description: "Tap the exact number of stars the pet asks for.",
    gradeBand: "early-years",
    subject: "Maths",
    gameType: "count-tap",
    topic: "Counting 1 to 5",
    difficulty: "starter",
    estimatedMinutes: 4,
    items: [
      {
        id: "tap-three",
        prompt: "Tap 3 stars.",
        tapItems: [tapItem("s1", "Star 1", "⭐"), tapItem("s2", "Star 2", "⭐"), tapItem("s3", "Star 3", "⭐"), tapItem("s4", "Star 4", "⭐"), tapItem("s5", "Star 5", "⭐")],
        targetCount: 3,
        answer: ["s1", "s2", "s3"],
        explanation: "Three stars make the number 3.",
      },
      {
        id: "tap-four",
        prompt: "Tap 4 balloons.",
        tapItems: [tapItem("b1", "Balloon 1", "🎈"), tapItem("b2", "Balloon 2", "🎈"), tapItem("b3", "Balloon 3", "🎈"), tapItem("b4", "Balloon 4", "🎈"), tapItem("b5", "Balloon 5", "🎈")],
        targetCount: 4,
        answer: ["b1", "b2", "b3", "b4"],
        explanation: "Four balloons make the number 4.",
      },
    ],
  },
  {
    id: "early-maths-shape-buddies",
    title: "Shape Buddies",
    description: "Match each shape with an object that has the same shape.",
    gradeBand: "early-years",
    subject: "Maths",
    gameType: "match-pairs",
    topic: "Shapes",
    difficulty: "starter",
    estimatedMinutes: 5,
    items: [
      {
        id: "shape-match",
        prompt: "Match every shape to its object.",
        leftItems: [choice("circle", "Circle", "⚪"), choice("triangle", "Triangle", "🔺"), choice("rectangle", "Rectangle", "▭")],
        rightItems: [choice("door", "Door", "🚪"), choice("pizza", "Pizza slice", "🍕"), choice("coin", "Coin", "🪙")],
        answer: { circle: "coin", triangle: "pizza", rectangle: "door" },
        explanation: "A coin is round, a pizza slice is triangular, and a door is rectangular.",
      },
    ],
  },
  {
    id: "early-evs-animal-homes",
    title: "Animal Homes",
    description: "Put each animal in the place where it lives.",
    gradeBand: "early-years",
    subject: "EVS",
    gameType: "sort",
    topic: "Animals and habitats",
    difficulty: "starter",
    estimatedMinutes: 5,
    items: [
      {
        id: "habitat-sort",
        prompt: "Sort the animals into land or water.",
        categories: [choice("land", "Land", "🌳"), choice("water", "Water", "🌊")],
        sortItems: [choice("lion", "Lion", "🦁"), choice("fish", "Fish", "🐟"), choice("elephant", "Elephant", "🐘"), choice("whale", "Whale", "🐋")],
        answer: { lion: "land", fish: "water", elephant: "land", whale: "water" },
        explanation: "Lions and elephants live on land; fish and whales live in water.",
      },
    ],
  },
  {
    id: "early-evs-morning-routine",
    title: "My Morning",
    description: "Put healthy morning activities in the right order.",
    gradeBand: "early-years",
    subject: "EVS",
    gameType: "sequence",
    topic: "Healthy routines",
    difficulty: "starter",
    estimatedMinutes: 4,
    items: [
      {
        id: "morning-order",
        prompt: "What happens first, next, and last?",
        steps: [choice("breakfast", "Eat breakfast", "🥣"), choice("wake", "Wake up", "🌅"), choice("brush", "Brush teeth", "🪥")],
        answer: ["wake", "brush", "breakfast"],
        explanation: "Wake up, brush your teeth, and then eat breakfast.",
      },
    ],
  },
  {
    id: "class12-english-word-workshop",
    title: "Word Workshop",
    description: "Unscramble familiar words using letter tiles.",
    gradeBand: "class1-2",
    subject: "English",
    gameType: "word-scramble",
    topic: "Spelling",
    difficulty: "easy",
    estimatedMinutes: 5,
    items: [
      { id: "scramble-plant", prompt: "Make the word shown by the picture.", visual: "🌱", tiles: ["T", "P", "A", "L", "N"], answer: "PLANT", explanation: "P-L-A-N-T spells PLANT." },
      { id: "scramble-book", prompt: "Make the word shown by the picture.", visual: "📘", tiles: ["O", "B", "K", "O"], answer: "BOOK", explanation: "B-O-O-K spells BOOK." },
      { id: "scramble-rain", prompt: "Make the word shown by the picture.", visual: "🌧️", tiles: ["N", "R", "I", "A"], answer: "RAIN", explanation: "R-A-I-N spells RAIN." },
    ],
  },
  {
    id: "class12-maths-number-quest",
    title: "Number Quest",
    description: "Solve short addition and subtraction puzzles.",
    gradeBand: "class1-2",
    subject: "Maths",
    gameType: "mcq",
    topic: "Addition and subtraction",
    difficulty: "easy",
    estimatedMinutes: 5,
    items: [
      { id: "add-7", prompt: "4 + 3 = ?", options: [choice("6", "6"), choice("7", "7"), choice("8", "8")], answer: "7", explanation: "Four plus three equals seven." },
      { id: "subtract-5", prompt: "9 − 4 = ?", options: [choice("4", "4"), choice("5", "5"), choice("6", "6")], answer: "5", explanation: "Nine minus four equals five." },
      { id: "add-12", prompt: "7 + 5 = ?", options: [choice("11", "11"), choice("12", "12"), choice("13", "13")], answer: "12", explanation: "Seven plus five equals twelve." },
    ],
  },
  {
    id: "class12-evs-clean-green",
    title: "Clean & Green",
    description: "Sort everyday actions into helpful and harmful choices.",
    gradeBand: "class1-2",
    subject: "EVS",
    gameType: "sort",
    topic: "Caring for the environment",
    difficulty: "easy",
    estimatedMinutes: 5,
    items: [
      {
        id: "green-sort",
        prompt: "Sort each action.",
        categories: [choice("helpful", "Helps Earth", "🌍"), choice("harmful", "Harms Earth", "⚠️")],
        sortItems: [choice("plant", "Plant a tree", "🌱"), choice("litter", "Drop litter", "🗑️"), choice("tap", "Turn off a running tap", "🚰"), choice("burn", "Burn plastic", "🔥")],
        answer: { plant: "helpful", litter: "harmful", tap: "helpful", burn: "harmful" },
        explanation: "Planting and saving water help Earth; littering and burning plastic harm it.",
      },
    ],
  },
  {
    id: "class12-gk-india-icons",
    title: "India Picture Quiz",
    description: "Recognise familiar Indian national symbols.",
    gradeBand: "class1-2",
    subject: "GK",
    gameType: "picture-choice",
    topic: "India and national symbols",
    difficulty: "easy",
    estimatedMinutes: 4,
    items: [
      { id: "national-animal", prompt: "Which is India's national animal?", options: [choice("tiger", "Tiger", "🐅"), choice("lion", "Lion", "🦁"), choice("elephant", "Elephant", "🐘")], answer: "tiger", explanation: "The Bengal tiger is India's national animal." },
      { id: "national-bird", prompt: "Which is India's national bird?", options: [choice("peacock", "Peacock", "🦚"), choice("parrot", "Parrot", "🦜"), choice("eagle", "Eagle", "🦅")], answer: "peacock", explanation: "The Indian peacock is India's national bird." },
    ],
  },
  {
    id: "class35-english-grammar-guardians",
    title: "Grammar Guardians",
    description: "Choose words that make each sentence correct.",
    gradeBand: "class3-5",
    subject: "English",
    gameType: "mcq",
    topic: "Grammar and vocabulary",
    difficulty: "medium",
    estimatedMinutes: 6,
    items: [
      { id: "verb", prompt: "Riya ___ to school every day.", options: [choice("walk", "walk"), choice("walks", "walks"), choice("walking", "walking")], answer: "walks", explanation: "A singular subject takes ‘walks’ in the simple present tense." },
      { id: "adjective", prompt: "Which word is the adjective: ‘The bright sun warmed us’ ?", options: [choice("sun", "sun"), choice("bright", "bright"), choice("warmed", "warmed")], answer: "bright", explanation: "‘Bright’ describes the sun, so it is an adjective." },
      { id: "synonym", prompt: "Which word means almost the same as ‘quick’ ?", options: [choice("slow", "slow"), choice("fast", "fast"), choice("quiet", "quiet")], answer: "fast", explanation: "‘Fast’ is a synonym of ‘quick’." },
    ],
  },
  {
    id: "class35-maths-fraction-trail",
    title: "Fraction Trail",
    description: "Order fractions and solve number patterns.",
    gradeBand: "class3-5",
    subject: "Maths",
    gameType: "sequence",
    topic: "Fractions and number patterns",
    difficulty: "medium",
    estimatedMinutes: 6,
    items: [
      {
        id: "fraction-order",
        prompt: "Arrange the fractions from smallest to largest.",
        steps: [choice("three-fourths", "3/4"), choice("one-fourth", "1/4"), choice("one-half", "1/2")],
        answer: ["one-fourth", "one-half", "three-fourths"],
        explanation: "One fourth is smaller than one half, and three fourths is the largest.",
      },
      {
        id: "pattern-order",
        prompt: "Put the next three numbers in the pattern in order: 5, 10, 15, ...",
        steps: [choice("30", "30"), choice("20", "20"), choice("25", "25")],
        answer: ["20", "25", "30"],
        explanation: "The pattern adds five each time.",
      },
    ],
  },
  {
    id: "class35-science-lab-sort",
    title: "Junior Science Lab",
    description: "Classify materials and changes like a scientist.",
    gradeBand: "class3-5",
    subject: "Science",
    gameType: "sort",
    topic: "Materials and changes",
    difficulty: "medium",
    estimatedMinutes: 6,
    items: [
      {
        id: "state-sort",
        prompt: "Sort each example by its state of matter.",
        categories: [choice("solid", "Solid"), choice("liquid", "Liquid"), choice("gas", "Gas")],
        sortItems: [choice("ice", "Ice", "🧊"), choice("water", "Water", "💧"), choice("steam", "Steam", "♨️"), choice("stone", "Stone", "🪨")],
        answer: { ice: "solid", water: "liquid", steam: "gas", stone: "solid" },
        explanation: "Ice and stone are solids, water is a liquid, and steam is a gas.",
      },
    ],
  },
  {
    id: "class35-social-map-match",
    title: "Map Match",
    description: "Match map directions with where they appear on a compass.",
    gradeBand: "class3-5",
    subject: "Social",
    gameType: "match-pairs",
    topic: "Maps and directions",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      {
        id: "direction-match",
        prompt: "Match each direction to its compass position.",
        leftItems: [choice("north", "North"), choice("east", "East"), choice("south", "South"), choice("west", "West")],
        rightItems: [choice("right", "Right →"), choice("down", "Down ↓"), choice("left", "Left ←"), choice("up", "Up ↑")],
        answer: { north: "up", east: "right", south: "down", west: "left" },
        explanation: "On a standard compass, north is up, east right, south down, and west left.",
      },
    ],
  },
  {
    id: "class35-gk-world-wonders",
    title: "World Explorer",
    description: "Test useful geography and general-knowledge facts.",
    gradeBand: "class3-5",
    subject: "GK",
    gameType: "listen-pick",
    topic: "World geography",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      { id: "largest-ocean", prompt: "Listen and choose the answer.", audioText: "Which is the largest ocean on Earth?", options: [choice("indian", "Indian Ocean"), choice("pacific", "Pacific Ocean"), choice("atlantic", "Atlantic Ocean")], answer: "pacific", explanation: "The Pacific Ocean is Earth's largest ocean." },
      { id: "red-planet", prompt: "Listen and choose the answer.", audioText: "Which planet is called the Red Planet?", options: [choice("mars", "Mars"), choice("venus", "Venus"), choice("jupiter", "Jupiter")], answer: "mars", explanation: "Mars looks red because of iron minerals in its soil." },
    ],
  },
]);

export const DEFAULT_KIDS_PARENT_SETTINGS = Object.freeze({
  gradeBand: "early-years",
  childNickname: "Learner",
  language: "en",
  dailyPlayLimitMinutes: 30,
  dailyMissionMinutes: 5,
  audioEnabled: true,
  timerVisible: true,
  hintsEnabled: true,
  gentleRetry: true,
  allowedSubjects: [...KIDS_SUBJECTS],
  parentPinConfigured: false,
});

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedLookup(value, allowedValues) {
  const key = String(value ?? "").trim().toLocaleLowerCase();
  return allowedValues.find((candidate) => candidate.toLocaleLowerCase() === key) || null;
}

export function normalizeKidsGradeBand(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const normalized = normalizedLookup(value, KIDS_GRADE_BANDS);
  if (!normalized || !GRADE_BAND_SET.has(normalized)) {
    validationError("Choose a supported age or grade band.", { code: "KIDS_GRADE_BAND_INVALID" });
  }
  return normalized;
}

export function normalizeKidsSubject(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const normalized = normalizedLookup(value, KIDS_SUBJECTS);
  if (!normalized || !SUBJECT_SET.has(normalized)) {
    validationError("Choose a supported Kids subject.", { code: "KIDS_SUBJECT_INVALID" });
  }
  return normalized;
}

export function normalizeKidsGameType(value, { optional = false } = {}) {
  if (optional && (value === undefined || value === null || value === "")) return null;
  const normalized = normalizedLookup(value, KIDS_GAME_TYPES);
  if (!normalized || !GAME_TYPE_SET.has(normalized)) {
    validationError("Choose a supported game type.", { code: "KIDS_GAME_TYPE_INVALID" });
  }
  return normalized;
}

export function publicKidsPack(pack) {
  if (!pack) return null;
  const publicPack = cloneJson(pack);
  publicPack.items = publicPack.items.map((item) => {
    const { answer: _answer, explanation: _explanation, ...safeItem } = item;
    return safeItem;
  });
  return publicPack;
}

export function listKidsPacks({ gradeBand = null, subject = null, gameType = null } = {}) {
  const normalizedGradeBand = normalizeKidsGradeBand(gradeBand, { optional: true });
  const normalizedSubject = normalizeKidsSubject(subject, { optional: true });
  const normalizedGameType = normalizeKidsGameType(gameType, { optional: true });
  return KIDS_CURATED_PACKS
    .filter((pack) => !normalizedGradeBand || pack.gradeBand === normalizedGradeBand)
    .filter((pack) => !normalizedSubject || pack.subject === normalizedSubject)
    .filter((pack) => !normalizedGameType || pack.gameType === normalizedGameType)
    .map(publicKidsPack);
}

export function getKidsPack(packId) {
  const normalizedId = String(packId ?? "").trim();
  return KIDS_CURATED_PACKS.find((pack) => pack.id === normalizedId) || null;
}

function normalizedString(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleUpperCase("en-IN");
}

function scoreMapping(answer, response) {
  const entries = Object.entries(answer || {});
  const candidate = response && typeof response === "object" && !Array.isArray(response) ? response : {};
  const earnedPoints = entries.reduce(
    (sum, [key, value]) => sum + (String(candidate[key] ?? "") === String(value) ? 1 : 0),
    0,
  );
  return { earnedPoints, possiblePoints: entries.length };
}

function scoreSequence(answer, response) {
  const expected = Array.isArray(answer) ? answer.map(String) : [];
  const candidate = Array.isArray(response) ? response.map(String) : [];
  const earnedPoints = expected.reduce(
    (sum, value, index) => sum + (candidate[index] === value ? 1 : 0),
    0,
  );
  return { earnedPoints, possiblePoints: expected.length };
}

function scoreKidsItem(gameType, item, response) {
  if (gameType === "match-pairs" || gameType === "sort") {
    return scoreMapping(item.answer, response);
  }
  if (gameType === "sequence") return scoreSequence(item.answer, response);
  if (gameType === "count-tap") {
    const selectedIds = Array.isArray(response) ? response.map(String) : [];
    const uniqueSelectedIds = new Set(selectedIds);
    const validIds = new Set((Array.isArray(item.tapItems) ? item.tapItems : []).map((entry) => String(entry.id)));
    const correct = selectedIds.length === Number(item.targetCount)
      && uniqueSelectedIds.size === selectedIds.length
      && selectedIds.every((id) => validIds.has(id));
    return { earnedPoints: correct ? 1 : 0, possiblePoints: 1 };
  }
  if (gameType === "word-scramble") {
    const correct = normalizedString(response) === normalizedString(item.answer);
    return { earnedPoints: correct ? 1 : 0, possiblePoints: 1 };
  }
  const correct = String(response ?? "") === String(item.answer);
  return { earnedPoints: correct ? 1 : 0, possiblePoints: 1 };
}

function safeResponseForResult(response) {
  if (Array.isArray(response)) return response.slice(0, 24).map((value) => String(value).slice(0, 80));
  if (response && typeof response === "object") {
    return Object.fromEntries(
      Object.entries(response).slice(0, 24).map(([key, value]) => [String(key).slice(0, 80), String(value).slice(0, 80)]),
    );
  }
  return String(response ?? "").slice(0, 120);
}

export function normalizeKidsAttemptSubmission(value) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const packId = String(payload.packId ?? "").trim();
  if (!packId || packId.length > 100) {
    validationError("A valid Kids pack ID is required.", { code: "KIDS_PACK_ID_INVALID" });
  }
  const pack = getKidsPack(packId);
  if (!pack) {
    validationError("That Kids activity pack was not found.", { code: "KIDS_PACK_NOT_FOUND", status: 404 });
  }
  const mode = ATTEMPT_MODE_SET.has(payload.mode) ? payload.mode : "game";
  const responseCountIsValid = Array.isArray(payload.responses) && (
    mode === "retry"
      ? payload.responses.length >= 1 && payload.responses.length <= pack.items.length
      : payload.responses.length === pack.items.length
  );
  if (!responseCountIsValid) {
    validationError("Submit one response for each activity item.", { code: "KIDS_RESPONSES_INVALID" });
  }
  const seen = new Set();
  const responses = payload.responses.map((entry) => {
    const itemId = String(entry?.itemId ?? "").trim();
    if (!pack.items.some((item) => item.id === itemId) || seen.has(itemId)) {
      validationError("The activity responses contain an invalid or repeated item.", { code: "KIDS_RESPONSES_INVALID" });
    }
    seen.add(itemId);
    return { itemId, response: safeResponseForResult(entry?.response) };
  });
  const durationSeconds = Math.max(0, Math.min(3_600, Math.round(Number(payload.durationSeconds) || 0)));
  const clientAttemptId = payload.clientAttemptId == null || payload.clientAttemptId === ""
    ? null
    : String(payload.clientAttemptId).trim();
  if (clientAttemptId && !CLIENT_ATTEMPT_ID_PATTERN.test(clientAttemptId)) {
    validationError("The offline attempt identifier is invalid.", { code: "KIDS_ATTEMPT_ID_INVALID" });
  }
  const localDate = payload.localDate == null || payload.localDate === ""
    ? null
    : normalizedLocalDateKey(payload.localDate);
  if (payload.localDate && !localDate) {
    validationError("The activity date is invalid.", { code: "KIDS_LOCAL_DATE_INVALID" });
  }
  return { pack, responses, durationSeconds, clientAttemptId, mode, localDate };
}

export function scoreKidsPackAttempt(pack, responses = []) {
  if (!pack || !GAME_TYPE_SET.has(pack.gameType) || !Array.isArray(pack.items)) {
    throw new TypeError("A valid curated Kids pack is required for scoring.");
  }
  const responseMap = new Map(
    (Array.isArray(responses) ? responses : []).map((entry) => [String(entry?.itemId ?? ""), entry?.response]),
  );
  const itemResults = pack.items.map((item) => {
    const response = responseMap.get(item.id);
    const scored = scoreKidsItem(pack.gameType, item, response);
    return {
      itemId: item.id,
      correct: scored.earnedPoints === scored.possiblePoints,
      earnedPoints: scored.earnedPoints,
      possiblePoints: scored.possiblePoints,
      response: safeResponseForResult(response),
      correctResponse: pack.gameType === "count-tap"
        ? { targetCount: Number(item.targetCount) || 0 }
        : cloneJson(item.answer),
      explanation: item.explanation,
    };
  });
  const earnedPoints = itemResults.reduce((sum, result) => sum + result.earnedPoints, 0);
  const possiblePoints = itemResults.reduce((sum, result) => sum + result.possiblePoints, 0);
  const correctCount = itemResults.filter((result) => result.correct).length;
  const scorePercent = possiblePoints ? Math.round(earnedPoints / possiblePoints * 100) : 0;
  return {
    correctCount,
    totalItems: itemResults.length,
    earnedPoints,
    possiblePoints,
    scorePercent,
    itemResults,
    missedItemIds: itemResults.filter((result) => !result.correct).map((result) => result.itemId),
  };
}

export function calculateKidsRewards({ scorePercent = 0, earnedPoints = 0, firstCompletion = false, mode = "game" } = {}) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(Number(scorePercent) || 0)));
  const starsEarned = normalizedScore >= 90 ? 3 : normalizedScore >= 70 ? 2 : 1;
  const firstCompletionBonus = firstCompletion ? 5 : 0;
  return {
    starsEarned,
    coinsEarned: starsEarned * 5 + firstCompletionBonus + (mode === "daily" ? 10 : mode === "boss" ? 15 : 0),
    xpEarned: Math.max(0, Math.round(Number(earnedPoints) || 0)) * 10 + 10,
    firstCompletionBonus,
  };
}

function validDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateKey(value) {
  return validDate(value)?.toISOString().slice(0, 10) || null;
}

function normalizedLocalDateKey(value) {
  const candidate = String(value ?? "").trim();
  if (!LOCAL_DATE_PATTERN.test(candidate)) return null;
  const parsed = validDate(`${candidate}T12:00:00.000Z`);
  return parsed && dateKey(parsed) === candidate ? candidate : null;
}

function attemptDateKey(attempt) {
  return normalizedLocalDateKey(attempt?.localDate) || dateKey(attempt?.completedAt);
}

function masteryLevel(score, attempts) {
  if (attempts >= 2 && score >= 85) return "mastered";
  if (score >= 70) return "growing";
  if (score >= 50) return "practicing";
  return "exploring";
}

function summarizeGroup(attempts) {
  const scores = attempts.map((attempt) => Math.max(0, Math.min(100, Number(attempt.scorePercent) || 0)));
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const bestScore = scores.length ? Math.max(...scores) : 0;
  const correctItems = attempts.reduce((sum, attempt) => sum + (Number(attempt.correctCount) || 0), 0);
  const totalItems = attempts.reduce((sum, attempt) => sum + (Number(attempt.totalItems) || 0), 0);
  const weightedMasteryPercent = totalItems ? Math.round(correctItems / totalItems * 100) : averageScore;
  return {
    attempts: attempts.length,
    averageScore,
    bestScore,
    correctItems,
    totalItems,
    masteryPercent: weightedMasteryPercent,
    masteryLevel: masteryLevel(weightedMasteryPercent, attempts.length),
  };
}

export function publicKidsAttempt(document) {
  if (!document) return null;
  return {
    id: String(document._id ?? document.id ?? ""),
    packId: String(document.packId ?? ""),
    gradeBand: document.gradeBand,
    subject: document.subject,
    gameType: document.gameType,
    topic: document.topic,
    mode: ATTEMPT_MODE_SET.has(document.mode) ? document.mode : "game",
    localDate: normalizedLocalDateKey(document.localDate),
    correctCount: Number(document.correctCount) || 0,
    totalItems: Number(document.totalItems) || 0,
    earnedPoints: Number(document.earnedPoints) || 0,
    possiblePoints: Number(document.possiblePoints) || 0,
    scorePercent: Number(document.scorePercent) || 0,
    starsEarned: Number(document.starsEarned) || 0,
    coinsEarned: Number(document.coinsEarned) || 0,
    xpEarned: Number(document.xpEarned) || 0,
    badgeAwarded: String(document.badgeAwarded || ""),
    durationSeconds: Number(document.durationSeconds) || 0,
    missedItemIds: Array.isArray(document.missedItemIds) ? document.missedItemIds.map(String) : [],
    completedAt: validDate(document.completedAt)?.toISOString() || new Date(0).toISOString(),
  };
}

export function summarizeKidsProgress(attempts = [], {
  now = new Date(),
  settings = DEFAULT_KIDS_PARENT_SETTINGS,
  todayKey = null,
} = {}) {
  const safeAttempts = (Array.isArray(attempts) ? attempts : [])
    .filter((attempt) => validDate(attempt?.completedAt))
    .sort((left, right) => validDate(right.completedAt) - validDate(left.completedAt));
  const today = normalizedLocalDateKey(todayKey) || dateKey(now);
  const todayAttempts = safeAttempts.filter((attempt) => attemptDateKey(attempt) === today);
  const minutesToday = Math.round(todayAttempts.reduce((sum, attempt) => sum + (Number(attempt.durationSeconds) || 0), 0) / 60);
  const dailyLimitMinutes = Number(settings?.dailyPlayLimitMinutes) || DEFAULT_KIDS_PARENT_SETTINGS.dailyPlayLimitMinutes;
  const subjectGroups = Object.fromEntries(KIDS_SUBJECTS.map((subject) => [subject, []]));
  const gameGroups = Object.fromEntries(KIDS_GAME_TYPES.map((gameType) => [gameType, []]));
  for (const attempt of safeAttempts) {
    if (subjectGroups[attempt.subject]) subjectGroups[attempt.subject].push(attempt);
    if (gameGroups[attempt.gameType]) gameGroups[attempt.gameType].push(attempt);
  }

  const activeDays = [...new Set(safeAttempts.map(attemptDateKey).filter(Boolean))].sort().reverse();
  let streakDays = 0;
  const cursor = validDate(`${today}T12:00:00.000Z`) || validDate(now) || new Date();
  for (let offset = 0; offset < 366; offset += 1) {
    const expected = new Date(cursor);
    expected.setUTCDate(expected.getUTCDate() - offset);
    if (!activeDays.includes(dateKey(expected))) {
      if (offset === 0 && activeDays.includes(dateKey(new Date(expected.getTime() - 86_400_000)))) continue;
      break;
    }
    streakDays += 1;
  }

  const weakTopicCounts = new Map();
  for (const attempt of safeAttempts) {
    const misses = Array.isArray(attempt.missedItemIds) ? attempt.missedItemIds.length : 0;
    if (!misses || !attempt.topic) continue;
    weakTopicCounts.set(attempt.topic, (weakTopicCounts.get(attempt.topic) || 0) + misses);
  }

  const retryQueue = [];
  const seenRetryItems = new Set();
  for (const attempt of safeAttempts) {
    const pack = getKidsPack(attempt.packId);
    if (!pack) continue;
    const missedItemIds = new Set((attempt.missedItemIds || []).map(String));
    const itemOutcomes = Array.isArray(attempt.itemResults) && attempt.itemResults.length
      ? attempt.itemResults.map((result) => ({
        itemId: String(result?.itemId || ""),
        correct: Boolean(result?.correct),
      }))
      : [...missedItemIds].map((itemId) => ({ itemId, correct: false }));
    for (const outcome of itemOutcomes) {
      const key = `${pack.id}:${outcome.itemId}`;
      if (seenRetryItems.has(key)) continue;
      seenRetryItems.add(key);
      if (outcome.correct) continue;
      const [item] = buildKidsRetryQueue(pack, [outcome.itemId]);
      if (!item) continue;
      retryQueue.push({ ...item, itemId: item.id });
      if (retryQueue.length >= 50) break;
    }
    if (retryQueue.length >= 50) break;
  }

  const bySubject = Object.fromEntries(KIDS_SUBJECTS.map((subject) => [subject, summarizeGroup(subjectGroups[subject])]));
  const byGameType = Object.fromEntries(KIDS_GAME_TYPES.map((gameType) => [gameType, summarizeGroup(gameGroups[gameType])]));
  const mastery = Object.fromEntries(
    Object.entries(bySubject)
      .filter(([, summary]) => summary.attempts > 0)
      .map(([subject, summary]) => [subject, {
        correct: summary.correctItems,
        total: summary.totalItems,
        percentage: summary.masteryPercent,
      }]),
  );
  const badges = [...new Set(safeAttempts.map((attempt) => String(attempt.badgeAwarded || "")).filter(Boolean))];
  const completedDailyMissions = [...new Set(
    safeAttempts.filter((attempt) => attempt.mode === "daily").map(attemptDateKey).filter(Boolean),
  )];
  const totalStars = safeAttempts.reduce((sum, attempt) => sum + (Number(attempt.starsEarned) || 0), 0);
  const totalCoins = safeAttempts.reduce((sum, attempt) => sum + (Number(attempt.coinsEarned) || 0), 0);
  const recentAttempts = safeAttempts.slice(0, 10).map(publicKidsAttempt);

  return {
    totalAttempts: safeAttempts.length,
    completedPacks: new Set(safeAttempts.map((attempt) => attempt.packId)).size,
    totalStars,
    totalCoins,
    totalXp: safeAttempts.reduce((sum, attempt) => sum + (Number(attempt.xpEarned) || 0), 0),
    streakDays,
    playTime: {
      minutesToday,
      dailyLimitMinutes,
      remainingMinutes: Math.max(0, dailyLimitMinutes - minutesToday),
      limitReached: minutesToday >= dailyLimitMinutes,
    },
    bySubject,
    byGameType,
    weakTopics: [...weakTopicCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 5)
      .map(([topic, missedItems]) => ({ topic, missedItems })),
    recentAttempts,
    stars: totalStars,
    coins: totalCoins,
    streak: streakDays,
    mastery,
    retryQueue,
    badges,
    attempts: recentAttempts,
    completedDailyMissions,
  };
}

function safeNickname(value) {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex -- intentional C0/DEL sanitization for child nicknames.
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 32);
}

export function normalizeKidsParentSettings(document = {}) {
  const allowedSubjects = Array.isArray(document.allowedSubjects)
    ? document.allowedSubjects.map((subject) => normalizedLookup(subject, KIDS_SUBJECTS)).filter(Boolean)
    : [...DEFAULT_KIDS_PARENT_SETTINGS.allowedSubjects];
  return {
    gradeBand: normalizedLookup(document.gradeBand, KIDS_GRADE_BANDS) || DEFAULT_KIDS_PARENT_SETTINGS.gradeBand,
    childNickname: safeNickname(document.childNickname) || DEFAULT_KIDS_PARENT_SETTINGS.childNickname,
    language: LANGUAGE_SET.has(document.language) ? document.language : DEFAULT_KIDS_PARENT_SETTINGS.language,
    dailyPlayLimitMinutes: Math.max(10, Math.min(120, Math.round(Number(document.dailyPlayLimitMinutes) || DEFAULT_KIDS_PARENT_SETTINGS.dailyPlayLimitMinutes))),
    dailyMissionMinutes: Math.max(5, Math.min(15, Math.round(Number(document.dailyMissionMinutes) || DEFAULT_KIDS_PARENT_SETTINGS.dailyMissionMinutes))),
    audioEnabled: document.audioEnabled !== false,
    timerVisible: document.timerVisible !== false,
    hintsEnabled: document.hintsEnabled !== false,
    gentleRetry: document.gentleRetry !== false,
    allowedSubjects: [...new Set(allowedSubjects.length ? allowedSubjects : DEFAULT_KIDS_PARENT_SETTINGS.allowedSubjects)],
    parentPinConfigured: Boolean(document.pinHash && document.pinSalt),
    updatedAt: validDate(document.updatedAt)?.toISOString() || null,
  };
}

export function prepareKidsParentSettingsUpdate(payload, currentDocument = {}, now = new Date()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    validationError("Parent settings must be an object.", { code: "KIDS_SETTINGS_INVALID" });
  }
  const merged = { ...normalizeKidsParentSettings(currentDocument) };
  if ("gradeBand" in payload) merged.gradeBand = normalizeKidsGradeBand(payload.gradeBand);
  if ("childNickname" in payload) {
    merged.childNickname = safeNickname(payload.childNickname);
    if (!merged.childNickname) validationError("Enter a nickname using up to 32 characters.", { code: "KIDS_NICKNAME_INVALID" });
  }
  if ("language" in payload) {
    const language = String(payload.language ?? "").trim().toLocaleLowerCase();
    if (!LANGUAGE_SET.has(language)) validationError("Choose English or Hindi for Kids instructions.", { code: "KIDS_LANGUAGE_INVALID" });
    merged.language = language;
  }
  for (const field of ["audioEnabled", "timerVisible", "hintsEnabled", "gentleRetry"]) {
    if (field in payload) {
      if (typeof payload[field] !== "boolean") validationError(`${field} must be true or false.`, { code: "KIDS_SETTINGS_INVALID" });
      merged[field] = payload[field];
    }
  }
  if ("dailyPlayLimitMinutes" in payload) {
    const value = Number(payload.dailyPlayLimitMinutes);
    if (!Number.isInteger(value) || value < 10 || value > 120) {
      validationError("Daily play time must be between 10 and 120 minutes.", { code: "KIDS_PLAY_LIMIT_INVALID" });
    }
    merged.dailyPlayLimitMinutes = value;
  }
  if ("dailyMissionMinutes" in payload) {
    const value = Number(payload.dailyMissionMinutes);
    if (!Number.isInteger(value) || value < 5 || value > 15) {
      validationError("Daily missions must be between 5 and 15 minutes.", { code: "KIDS_MISSION_LENGTH_INVALID" });
    }
    merged.dailyMissionMinutes = value;
  }
  if ("allowedSubjects" in payload) {
    if (!Array.isArray(payload.allowedSubjects) || !payload.allowedSubjects.length) {
      validationError("Allow at least one Kids subject.", { code: "KIDS_SUBJECTS_INVALID" });
    }
    const subjects = payload.allowedSubjects.map((subject) => normalizeKidsSubject(subject));
    merged.allowedSubjects = [...new Set(subjects)];
  }

  const set = {
    gradeBand: merged.gradeBand,
    childNickname: merged.childNickname,
    language: merged.language,
    dailyPlayLimitMinutes: merged.dailyPlayLimitMinutes,
    dailyMissionMinutes: merged.dailyMissionMinutes,
    audioEnabled: merged.audioEnabled,
    timerVisible: merged.timerVisible,
    hintsEnabled: merged.hintsEnabled,
    gentleRetry: merged.gentleRetry,
    allowedSubjects: merged.allowedSubjects,
    updatedAt: validDate(now) || new Date(),
  };
  const unset = {};
  if ("parentPin" in payload) {
    const pin = String(payload.parentPin ?? "").trim();
    if (!PIN_PATTERN.test(pin)) {
      validationError("Use a 4 to 6 digit parent PIN.", { code: "KIDS_PARENT_PIN_INVALID" });
    }
    Object.assign(set, hashKidsParentPin(pin));
  }
  if (payload.clearParentPin === true) {
    unset.pinHash = "";
    unset.pinSalt = "";
    unset.pinIterations = "";
    delete set.pinHash;
    delete set.pinSalt;
    delete set.pinIterations;
  }
  return { set, unset };
}

export function hashKidsParentPin(pin, { salt = randomBytes(16).toString("hex"), iterations = 120_000 } = {}) {
  const normalizedPin = String(pin ?? "").trim();
  if (!PIN_PATTERN.test(normalizedPin)) {
    validationError("Use a 4 to 6 digit parent PIN.", { code: "KIDS_PARENT_PIN_INVALID" });
  }
  return {
    pinHash: pbkdf2Sync(normalizedPin, salt, iterations, 32, "sha256").toString("hex"),
    pinSalt: salt,
    pinIterations: iterations,
  };
}

export function verifyKidsParentPin(pin, document = {}) {
  const candidate = String(pin ?? "").trim();
  if (!PIN_PATTERN.test(candidate) || !document.pinHash || !document.pinSalt) return false;
  const iterations = Math.max(1, Number(document.pinIterations) || 120_000);
  const expected = Buffer.from(String(document.pinHash), "hex");
  const actual = pbkdf2Sync(candidate, String(document.pinSalt), iterations, expected.length, "sha256");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function chooseKidsDailyMission({ gradeBand, subject = null, allowedSubjects = KIDS_SUBJECTS, date = new Date() } = {}) {
  const normalizedGradeBand = normalizeKidsGradeBand(gradeBand || DEFAULT_KIDS_PARENT_SETTINGS.gradeBand);
  const normalizedSubject = normalizeKidsSubject(subject, { optional: true });
  const allowed = new Set(
    (Array.isArray(allowedSubjects) ? allowedSubjects : KIDS_SUBJECTS)
      .map((item) => normalizedLookup(item, KIDS_SUBJECTS))
      .filter(Boolean),
  );
  let candidates = KIDS_CURATED_PACKS.filter((pack) => (
    pack.gradeBand === normalizedGradeBand
    && allowed.has(pack.subject)
    && (!normalizedSubject || pack.subject === normalizedSubject)
  ));
  if (!candidates.length && normalizedSubject) {
    candidates = KIDS_CURATED_PACKS.filter((pack) => pack.gradeBand === normalizedGradeBand && allowed.has(pack.subject));
  }
  if (!candidates.length) candidates = KIDS_CURATED_PACKS.filter((pack) => pack.gradeBand === normalizedGradeBand);
  const missionDate = dateKey(date) || dateKey(new Date());
  const seed = [...missionDate, ...normalizedGradeBand].reduce((sum, character) => sum + character.codePointAt(0), 0);
  const selected = candidates[seed % candidates.length];
  return {
    ...publicKidsPack(selected),
    missionDate,
    isDailyMission: true,
    bonusCoins: 5,
  };
}

export function buildKidsRetryQueue(pack, missedItemIds = []) {
  const missed = new Set(Array.isArray(missedItemIds) ? missedItemIds.map(String) : []);
  const publicPack = publicKidsPack(pack);
  return publicPack.items
    .filter((item) => missed.has(item.id))
    .map((item) => ({
      packId: pack.id,
      gradeBand: pack.gradeBand,
      subject: pack.subject,
      gameType: pack.gameType,
      topic: pack.topic,
      ...item,
    }));
}
