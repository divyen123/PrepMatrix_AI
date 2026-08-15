import { academicProfileStorageKey } from "./academicProfileScope.js";

export const SCHOOL_KNOWLEDGE_STORAGE_VERSION = 1;
export const SCHOOL_KNOWLEDGE_STORAGE_PREFIX = "prepmatrix_school_knowledge_v1";
export const SCHOOL_KNOWLEDGE_DAILY_QUESTION_COUNT = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

function option(id, label) {
  return Object.freeze({ id, label });
}

function question(id, category, prompt, choices, answer, explanation, difficulty = "core") {
  return Object.freeze({
    id,
    category,
    prompt,
    options: Object.freeze(choices.map(([choiceId, label]) => option(choiceId, label))),
    answer,
    explanation,
    difficulty,
  });
}

export const SCHOOL_KNOWLEDGE_QUESTIONS = Object.freeze([
  question("india-capital", "India", "What is the capital of India?", [["mumbai", "Mumbai"], ["new-delhi", "New Delhi"], ["kolkata", "Kolkata"], ["chennai", "Chennai"]], "new-delhi", "New Delhi is the capital of India."),
  question("india-national-river", "India", "Which river is recognised as India's national river?", [["ganga", "Ganga"], ["godavari", "Godavari"], ["yamuna", "Yamuna"], ["narmada", "Narmada"]], "ganga", "The Ganga is recognised as India's national river."),
  question("india-constitution-day", "India", "On which date is Constitution Day observed in India?", [["jan-26", "26 January"], ["aug-15", "15 August"], ["nov-26", "26 November"], ["oct-2", "2 October"]], "nov-26", "India observes Constitution Day on 26 November, the date the Constitution was adopted in 1949.", "stretch"),
  question("india-gateway", "India", "In which city is the Gateway of India?", [["jaipur", "Jaipur"], ["mumbai", "Mumbai"], ["hyderabad", "Hyderabad"], ["kochi", "Kochi"]], "mumbai", "The Gateway of India stands beside Mumbai Harbour."),
  question("india-sanchi", "India", "The Great Stupa at Sanchi is in which state?", [["madhya-pradesh", "Madhya Pradesh"], ["odisha", "Odisha"], ["gujarat", "Gujarat"], ["bihar", "Bihar"]], "madhya-pradesh", "Sanchi is an important Buddhist site in Madhya Pradesh.", "stretch"),
  question("india-space-centre", "India", "Which Indian organisation launches missions such as Chandrayaan?", [["drdo", "DRDO"], ["isro", "ISRO"], ["csir", "CSIR"], ["bhel", "BHEL"]], "isro", "ISRO is India's national space agency."),
  question("world-largest-continent", "World", "Which is the largest continent by land area?", [["africa", "Africa"], ["asia", "Asia"], ["europe", "Europe"], ["antarctica", "Antarctica"]], "asia", "Asia is the world's largest continent by land area."),
  question("world-equator", "World", "What imaginary line divides Earth into the Northern and Southern Hemispheres?", [["prime-meridian", "Prime Meridian"], ["equator", "Equator"], ["tropic-cancer", "Tropic of Cancer"], ["arctic-circle", "Arctic Circle"]], "equator", "The Equator circles Earth halfway between the North and South Poles."),
  question("world-nile", "World", "The Nile River flows into which sea?", [["arabian-sea", "Arabian Sea"], ["red-sea", "Red Sea"], ["mediterranean", "Mediterranean Sea"], ["black-sea", "Black Sea"]], "mediterranean", "The Nile reaches the Mediterranean Sea through its delta in Egypt.", "stretch"),
  question("world-japan", "World", "Which city is the capital of Japan?", [["osaka", "Osaka"], ["kyoto", "Kyoto"], ["tokyo", "Tokyo"], ["sapporo", "Sapporo"]], "tokyo", "Tokyo is the capital of Japan."),
  question("world-sahara", "World", "On which continent is the Sahara Desert?", [["asia", "Asia"], ["south-america", "South America"], ["africa", "Africa"], ["australia", "Australia"]], "africa", "The Sahara stretches across northern Africa."),
  question("world-pacific", "World", "Which is the largest ocean on Earth?", [["atlantic", "Atlantic Ocean"], ["indian", "Indian Ocean"], ["pacific", "Pacific Ocean"], ["arctic", "Arctic Ocean"]], "pacific", "The Pacific Ocean is the largest and deepest ocean on Earth."),
  question("space-red-planet", "Space", "Which planet is known as the Red Planet?", [["venus", "Venus"], ["mars", "Mars"], ["jupiter", "Jupiter"], ["mercury", "Mercury"]], "mars", "Iron-rich minerals give Mars its reddish appearance."),
  question("space-largest-planet", "Space", "Which is the largest planet in our solar system?", [["saturn", "Saturn"], ["earth", "Earth"], ["jupiter", "Jupiter"], ["neptune", "Neptune"]], "jupiter", "Jupiter is the largest planet in our solar system."),
  question("space-moon-light", "Space", "Why does the Moon appear to shine?", [["makes-light", "It makes its own light"], ["reflects-sun", "It reflects sunlight"], ["reflects-earth", "It reflects city lights"], ["hot-rocks", "Its rocks glow"]], "reflects-sun", "The Moon does not make visible light; its surface reflects sunlight."),
  question("space-orbit", "Space", "What force keeps planets moving around the Sun?", [["magnetism", "Magnetism"], ["friction", "Friction"], ["gravity", "Gravity"], ["electricity", "Electricity"]], "gravity", "The Sun's gravity keeps the planets in orbit.", "stretch"),
  question("space-first-human", "Space", "Who was the first human to travel into space?", [["neil-armstrong", "Neil Armstrong"], ["yuri-gagarin", "Yuri Gagarin"], ["kalpana-chawla", "Kalpana Chawla"], ["buzz-aldrin", "Buzz Aldrin"]], "yuri-gagarin", "Yuri Gagarin orbited Earth in 1961.", "stretch"),
  question("space-star", "Space", "What kind of object is the Sun?", [["planet", "A planet"], ["moon", "A moon"], ["star", "A star"], ["comet", "A comet"]], "star", "The Sun is the star at the centre of our solar system."),
  question("science-plants-food", "Science", "Which process lets green plants make food using light?", [["respiration", "Respiration"], ["photosynthesis", "Photosynthesis"], ["evaporation", "Evaporation"], ["germination", "Germination"]], "photosynthesis", "During photosynthesis, plants use light, water, and carbon dioxide to make food."),
  question("science-water-boil", "Science", "At sea level, pure water boils at approximately what temperature?", [["50-c", "50°C"], ["75-c", "75°C"], ["100-c", "100°C"], ["150-c", "150°C"]], "100-c", "At normal atmospheric pressure, pure water boils at about 100°C."),
  question("science-blood-pump", "Science", "Which organ pumps blood around the human body?", [["lungs", "Lungs"], ["heart", "Heart"], ["kidneys", "Kidneys"], ["stomach", "Stomach"]], "heart", "The heart pumps blood through the body's blood vessels."),
  question("science-sound", "Science", "Sound usually travels fastest through which type of material?", [["gas", "Gas"], ["liquid", "Liquid"], ["solid", "Solid"], ["vacuum", "Vacuum"]], "solid", "Particles are packed closely in solids, so vibrations usually pass through them fastest.", "stretch"),
  question("science-magnet", "Science", "Which material is strongly attracted to an ordinary magnet?", [["plastic", "Plastic"], ["iron", "Iron"], ["glass", "Glass"], ["wood", "Wood"]], "iron", "Iron is a magnetic material."),
  question("science-vertebrate", "Science", "An animal with a backbone is called what?", [["invertebrate", "Invertebrate"], ["vertebrate", "Vertebrate"], ["amphibian", "Amphibian"], ["herbivore", "Herbivore"]], "vertebrate", "Vertebrates are animals that have a backbone."),
  question("nature-pollinator", "Nature", "Which insect is especially important for pollinating many flowering plants?", [["ant", "Ant"], ["bee", "Bee"], ["termite", "Termite"], ["mosquito", "Mosquito"]], "bee", "Bees carry pollen between flowers while collecting nectar and pollen."),
  question("nature-food-chain", "Nature", "In a food chain, what is a green plant usually called?", [["consumer", "Consumer"], ["predator", "Predator"], ["producer", "Producer"], ["decomposer", "Decomposer"]], "producer", "Plants are producers because they make their own food."),
  question("nature-renewable", "Nature", "Which source of energy is renewable?", [["coal", "Coal"], ["petroleum", "Petroleum"], ["sunlight", "Sunlight"], ["natural-gas", "Natural gas"]], "sunlight", "Sunlight is naturally replenished and can be used for solar energy."),
  question("nature-three-rs", "Nature", "Which set correctly names the three Rs of waste management?", [["read-run-rest", "Read, Run, Rest"], ["reduce-reuse-recycle", "Reduce, Reuse, Recycle"], ["repair-return-repeat", "Repair, Return, Repeat"], ["remove-replace-rebuild", "Remove, Replace, Rebuild"]], "reduce-reuse-recycle", "Reduce, Reuse, and Recycle help limit waste and conserve resources."),
  question("nature-mangrove", "Nature", "Mangrove forests are commonly found in which environment?", [["high-mountains", "High mountains"], ["coastal-wetlands", "Coastal wetlands"], ["dry-deserts", "Dry deserts"], ["polar-ice", "Polar ice"]], "coastal-wetlands", "Mangroves grow in salty or brackish coastal wetlands.", "stretch"),
  question("civics-vote", "Civics", "In a democracy, what is an election used for?", [["choose-representatives", "Choosing representatives"], ["write-textbooks", "Writing textbooks"], ["predict-weather", "Predicting weather"], ["measure-roads", "Measuring roads"]], "choose-representatives", "Elections allow citizens to choose representatives."),
  question("civics-local-city", "Civics", "Which local body commonly manages services in a large city in India?", [["municipal-corporation", "Municipal corporation"], ["parliament", "Parliament"], ["supreme-court", "Supreme Court"], ["village-panchayat", "Village panchayat"]], "municipal-corporation", "Municipal corporations manage many civic services in large cities.", "stretch"),
  question("civics-fundamental-duties", "Civics", "Protecting public property is an example of what for Indian citizens?", [["fundamental-duty", "A Fundamental Duty"], ["private-hobby", "A private hobby"], ["trade-rule", "A trade rule"], ["weather-law", "A weather law"]], "fundamental-duty", "Safeguarding public property is listed among the Fundamental Duties.", "stretch"),
  question("technology-cpu", "Technology", "Which computer part carries out most instructions?", [["monitor", "Monitor"], ["keyboard", "Keyboard"], ["cpu", "CPU"], ["speaker", "Speaker"]], "cpu", "The central processing unit executes instructions and processes data."),
  question("technology-browser", "Technology", "Which type of app is used to open and view websites?", [["browser", "Web browser"], ["calculator", "Calculator"], ["paint", "Drawing app"], ["clock", "Clock app"]], "browser", "A web browser retrieves and displays websites."),
  question("technology-password", "Technology", "Which password is generally the strongest?", [["name123", "Your name plus 123"], ["password", "password"], ["long-mix", "A long, unique mix of words and symbols"], ["birthday", "Your birthday"]], "long-mix", "Long, unique passwords or passphrases are harder to guess."),
  question("technology-robot", "Technology", "What lets many robots detect objects around them?", [["sensors", "Sensors"], ["paint", "Paint"], ["wheels-only", "Only wheels"], ["stickers", "Stickers"]], "sensors", "Sensors collect information such as distance, light, sound, or touch."),
  question("culture-panchatantra", "Culture", "The Panchatantra is best known as a collection of what?", [["maps", "Maps"], ["animal-fable-stories", "Animal fables"], ["science-formulas", "Science formulas"], ["sports-rules", "Sports rules"]], "animal-fable-stories", "The Panchatantra uses memorable animal fables to share practical wisdom."),
  question("culture-classical-dance", "Culture", "Bharatanatyam is a classical dance form associated especially with which state?", [["tamil-nadu", "Tamil Nadu"], ["punjab", "Punjab"], ["assam", "Assam"], ["goa", "Goa"]], "tamil-nadu", "Bharatanatyam developed in Tamil Nadu."),
  question("culture-raga", "Culture", "In Indian classical music, what does a raga mainly provide?", [["melodic-framework", "A melodic framework"], ["stage-light", "A stage light"], ["dance-costume", "A dance costume"], ["drum-stick", "A drum stick"]], "melodic-framework", "A raga is a melodic framework used for composition and improvisation.", "stretch"),
  question("sports-olympic-rings", "Sports", "How many rings are in the Olympic symbol?", [["four", "Four"], ["five", "Five"], ["six", "Six"], ["seven", "Seven"]], "five", "The Olympic symbol has five interlocking rings."),
  question("sports-cricket", "Sports", "How many players from one team are normally on the field in cricket?", [["nine", "Nine"], ["ten", "Ten"], ["eleven", "Eleven"], ["twelve", "Twelve"]], "eleven", "A cricket team has eleven players."),
  question("sports-chess", "Sports", "Which chess piece moves in an L-shape?", [["bishop", "Bishop"], ["rook", "Rook"], ["knight", "Knight"], ["queen", "Queen"]], "knight", "The knight moves two squares in one direction and one square sideways."),
]);

function cleanText(value, maxLength = 120) {
  return String(value ?? "").replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

function hashString(value) {
  let hash = 2166136261;
  const input = String(value ?? "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seedValue) {
  let seed = hashString(seedValue) || 0x6d2b79f5;
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(value.getTime())) return localDateKey(new Date());
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseDateKey(value) {
  const key = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(key)) return null;
  const date = new Date(key + "T12:00:00");
  return Number.isFinite(date.getTime()) ? date : null;
}

function normalizedGrade(value) {
  const text = cleanText(value, 80);
  const match = text.match(/(?:class|grade|standard|std\.?)[\s:-]*([4-8])\b/iu);
  if (match) return Number(match[1]);
  const numeric = Number.parseInt(text, 10);
  return numeric >= 4 && numeric <= 8 ? numeric : 4;
}

function shuffledQuestions(seedValue, questions) {
  const random = seededRandom(seedValue);
  const copy = [...questions];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function getSchoolKnowledgeDateKey(date = new Date()) {
  return localDateKey(date);
}

export function getSchoolKnowledgeUserKey(profile = {}) {
  const identifier = cleanText(profile?.id || profile?._id || profile?.email || "local-learner", 200).toLocaleLowerCase();
  return hashString(identifier).toString(36);
}

export function getSchoolKnowledgeStorageKey(profile = {}) {
  const scopedKey = academicProfileStorageKey(
    profile?.dataId || profile?.academicProfileId,
    "school-knowledge",
  );
  if (scopedKey) return scopedKey;
  return SCHOOL_KNOWLEDGE_STORAGE_PREFIX + ":" + getSchoolKnowledgeUserKey(profile);
}

export function buildSchoolKnowledgeDailyChallenge({
  date = new Date(),
  grade = 4,
  questionCount = SCHOOL_KNOWLEDGE_DAILY_QUESTION_COUNT,
  userKey = "shared",
} = {}) {
  const dateKey = localDateKey(date);
  const classNumber = normalizedGrade(grade);
  const boundedCount = Math.max(4, Math.min(12, Number.parseInt(questionCount, 10) || SCHOOL_KNOWLEDGE_DAILY_QUESTION_COUNT));
  const gradePool = SCHOOL_KNOWLEDGE_QUESTIONS.filter((entry) => (
    classNumber >= 6 || entry.difficulty !== "stretch"
  ));
  const ordered = shuffledQuestions(dateKey + ":" + classNumber + ":" + cleanText(userKey, 80), gradePool);
  const categories = new Set();
  const selected = [];

  ordered.forEach((entry) => {
    if (selected.length >= boundedCount) return;
    if (!categories.has(entry.category)) {
      selected.push(entry);
      categories.add(entry.category);
    }
  });
  ordered.forEach((entry) => {
    if (selected.length >= boundedCount) return;
    if (!selected.some(({ id }) => id === entry.id)) selected.push(entry);
  });

  return {
    id: "school-knowledge-" + dateKey + "-class-" + classNumber,
    dateKey,
    grade: classNumber,
    title: "Today's Knowledge Quest",
    questions: selected,
  };
}

export function scoreSchoolKnowledgeChallenge(challenge, answers = {}) {
  const questions = Array.isArray(challenge?.questions) ? challenge.questions : [];
  const answerMap = answers && typeof answers === "object" ? answers : {};
  const review = questions.map((entry) => {
    const selectedAnswer = cleanText(answerMap[entry.id], 80);
    const correct = selectedAnswer === entry.answer;
    const selectedOption = entry.options.find(({ id }) => id === selectedAnswer);
    const correctOption = entry.options.find(({ id }) => id === entry.answer);
    return {
      id: entry.id,
      category: entry.category,
      prompt: entry.prompt,
      selectedAnswer,
      selectedLabel: selectedOption?.label || "Not answered",
      correctAnswer: entry.answer,
      correctLabel: correctOption?.label || "",
      correct,
      explanation: entry.explanation,
    };
  });
  const correct = review.filter((entry) => entry.correct).length;
  const total = review.length;
  return {
    challengeId: cleanText(challenge?.id, 120),
    dateKey: cleanText(challenge?.dateKey, 10) || localDateKey(),
    correct,
    total,
    percentage: total ? Math.round(correct / total * 100) : 0,
    review,
  };
}

export function createDefaultSchoolKnowledgeProgress() {
  return {
    version: SCHOOL_KNOWLEDGE_STORAGE_VERSION,
    attempts: 0,
    bestScore: 0,
    bestTotal: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    completedDateKeys: [],
    streak: 0,
    lastCompletedDateKey: "",
    lastResult: null,
  };
}

function uniqueDateKeys(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => cleanText(value, 10))
    .filter((value) => parseDateKey(value)))]
    .sort();
}

function calculateDateStreak(dateKeys) {
  const values = uniqueDateKeys(dateKeys);
  if (!values.length) return 0;
  let streak = 1;
  for (let index = values.length - 1; index > 0; index -= 1) {
    const current = parseDateKey(values[index]);
    const previous = parseDateKey(values[index - 1]);
    if (!current || !previous || Math.round((current - previous) / DAY_MS) !== 1) break;
    streak += 1;
  }
  return streak;
}

export function normalizeSchoolKnowledgeProgress(value) {
  const source = value && typeof value === "object" ? value : {};
  const completedDateKeys = uniqueDateKeys(source.completedDateKeys);
  const lastResult = source.lastResult && typeof source.lastResult === "object"
    ? {
        challengeId: cleanText(source.lastResult.challengeId, 120),
        dateKey: cleanText(source.lastResult.dateKey, 10),
        correct: Math.max(0, Number(source.lastResult.correct) || 0),
        total: Math.max(0, Number(source.lastResult.total) || 0),
        percentage: Math.max(0, Math.min(100, Number(source.lastResult.percentage) || 0)),
      }
    : null;
  return {
    version: SCHOOL_KNOWLEDGE_STORAGE_VERSION,
    attempts: Math.max(0, Number(source.attempts) || 0),
    bestScore: Math.max(0, Number(source.bestScore) || 0),
    bestTotal: Math.max(0, Number(source.bestTotal) || 0),
    totalCorrect: Math.max(0, Number(source.totalCorrect) || 0),
    totalQuestions: Math.max(0, Number(source.totalQuestions) || 0),
    completedDateKeys,
    streak: calculateDateStreak(completedDateKeys),
    lastCompletedDateKey: completedDateKeys.at(-1) || "",
    lastResult,
  };
}

export function applySchoolKnowledgeResult(progress, result) {
  const current = normalizeSchoolKnowledgeProgress(progress);
  const nextResult = {
    challengeId: cleanText(result?.challengeId, 120),
    dateKey: cleanText(result?.dateKey, 10) || localDateKey(),
    correct: Math.max(0, Number(result?.correct) || 0),
    total: Math.max(0, Number(result?.total) || 0),
    percentage: Math.max(0, Math.min(100, Number(result?.percentage) || 0)),
  };
  const completedDateKeys = uniqueDateKeys([...current.completedDateKeys, nextResult.dateKey]);
  const isNewBest = nextResult.percentage > (current.bestTotal
    ? Math.round(current.bestScore / current.bestTotal * 100)
    : -1);
  return {
    ...current,
    attempts: current.attempts + 1,
    bestScore: isNewBest ? nextResult.correct : current.bestScore,
    bestTotal: isNewBest ? nextResult.total : current.bestTotal,
    totalCorrect: current.totalCorrect + nextResult.correct,
    totalQuestions: current.totalQuestions + nextResult.total,
    completedDateKeys,
    streak: calculateDateStreak(completedDateKeys),
    lastCompletedDateKey: completedDateKeys.at(-1) || "",
    lastResult: nextResult,
  };
}

export function loadSchoolKnowledgeProgress(storage, profile = {}) {
  try {
    const parsed = JSON.parse(storage?.getItem?.(getSchoolKnowledgeStorageKey(profile)) || "null");
    if (!parsed || parsed.version !== SCHOOL_KNOWLEDGE_STORAGE_VERSION) {
      return createDefaultSchoolKnowledgeProgress();
    }
    return normalizeSchoolKnowledgeProgress(parsed);
  } catch {
    return createDefaultSchoolKnowledgeProgress();
  }
}

export function saveSchoolKnowledgeProgress(storage, profile = {}, progress) {
  const normalized = normalizeSchoolKnowledgeProgress(progress);
  try {
    storage?.setItem?.(getSchoolKnowledgeStorageKey(profile), JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function millisecondsUntilNextSchoolKnowledgeDay(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.getTime())) return DAY_MS;
  const tomorrow = new Date(value);
  tomorrow.setHours(24, 0, 0, 0);
  return Math.max(1_000, tomorrow.getTime() - value.getTime());
}
