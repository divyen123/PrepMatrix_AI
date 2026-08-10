export const KIDS_STORAGE_VERSION = 1;
export const KIDS_STORAGE_PREFIX = "prepmatrix_kids_v1";

export const KIDS_AGE_BANDS = [
  {
    id: "early-years",
    label: "Kindergarten",
    labelHi: "किंडरगार्टन",
    grades: "Nursery · LKG · UKG",
    helper: "Pictures, sounds, counting and playful discovery",
    helperHi: "चित्र, ध्वनि, गिनती और खेल-खेल में सीखना",
    icon: "🌱",
  },
  {
    id: "class1-2",
    label: "Classes 1–2",
    labelHi: "कक्षा 1–2",
    grades: "Ages 6–8",
    helper: "Build strong reading, maths and EVS foundations",
    helperHi: "पढ़ने, गणित और ईवीएस की मजबूत नींव",
    icon: "🚀",
  },
  {
    id: "class3-5",
    label: "Classes 3–5",
    labelHi: "कक्षा 3–5",
    grades: "Ages 8–11",
    helper: "Quests for reasoning, science and confident practice",
    helperHi: "तर्क, विज्ञान और आत्मविश्वास के लिए मिशन",
    icon: "🏆",
  },
];

export const KIDS_SUBJECTS = {
  English: {
    id: "English",
    name: "English",
    nameHi: "अंग्रेज़ी",
    world: "Story Sky",
    worldHi: "कहानी का आसमान",
    icon: "📚",
    color: "#8b5cf6",
    softColor: "#ede9fe",
  },
  Maths: {
    id: "Maths",
    name: "Maths",
    nameHi: "गणित",
    world: "Number Jungle",
    worldHi: "अंकों का जंगल",
    icon: "🔢",
    color: "#0ea5e9",
    softColor: "#e0f2fe",
  },
  EVS: {
    id: "EVS",
    name: "EVS",
    nameHi: "ईवीएस",
    world: "Nature Park",
    worldHi: "प्रकृति पार्क",
    icon: "🌿",
    color: "#10b981",
    softColor: "#d1fae5",
  },
  Science: {
    id: "Science",
    name: "Science",
    nameHi: "विज्ञान",
    world: "Wonder Lab",
    worldHi: "अनोखी प्रयोगशाला",
    icon: "🔬",
    color: "#f97316",
    softColor: "#ffedd5",
  },
  Social: {
    id: "Social",
    name: "Social Studies",
    nameHi: "सामाजिक अध्ययन",
    world: "World Explorer",
    worldHi: "दुनिया की खोज",
    icon: "🌍",
    color: "#ec4899",
    softColor: "#fce7f3",
  },
};

export const SUBJECTS_BY_AGE_BAND = {
  "early-years": ["English", "Maths", "EVS"],
  "class1-2": ["English", "Maths", "EVS"],
  "class3-5": ["English", "Maths", "Science", "Social"],
};

export const KIDS_GAME_TYPES = {
  "picture-choice": { label: "Picture Pick", labelHi: "चित्र चुनो", icon: "🖼️" },
  "listen-pick": { label: "Listen & Pick", labelHi: "सुनो और चुनो", icon: "🔊" },
  "count-tap": { label: "Count & Tap", labelHi: "गिनो और चुनो", icon: "👆" },
  matching: { label: "Match Pairs", labelHi: "जोड़ी मिलाओ", icon: "🧩" },
  sorting: { label: "Sort It", labelHi: "सही जगह रखो", icon: "🧺" },
  sequence: { label: "Put in Order", labelHi: "क्रम में लगाओ", icon: "🪜" },
  scramble: { label: "Word Builder", labelHi: "शब्द बनाओ", icon: "🔤" },
  mcq: { label: "Quiz Quest", labelHi: "क्विज़ मिशन", icon: "✨" },
};

export const KIDS_UI = {
  en: {
    playLearn: "Play & Learn",
    heroTitle: "Choose a world. Start an adventure!",
    heroCopy: "Short, joyful games made for curious young learners.",
    stars: "Stars",
    coins: "Coins",
    streak: "Day streak",
    chooseLevel: "Choose learning level",
    adventureMap: "Adventure map",
    pickWorld: "Pick a subject world to see its games.",
    dailyMission: "Daily 5-minute mission",
    dailyCopy: "A little mix of practice, chosen just for you.",
    startMission: "Start mission",
    games: "Games",
    bossRound: "Boss round",
    bossCopy: "Seven challenge questions to win a subject badge.",
    play: "Play",
    retryPractice: "Gentle retry practice",
    retryCopy: "Try tricky questions again—no points are ever lost.",
    practice: "Practice mistakes",
    parentCorner: "Parent Corner",
    grownUpsOnly: "Grown-ups only",
    backToMap: "Back to map",
    question: "Question",
    check: "Check answer",
    next: "Next question",
    finish: "Finish adventure",
    correct: "Brilliant! You got it.",
    incorrect: "Nice try! We’ll practise this one again later.",
    saved: "Answer saved. Keep exploring!",
    hint: "Hint",
    readToMe: "Read to me",
    sessionTime: "Play time",
    minutesLeft: "min left",
    timeUp: "Play time is finished for now",
    timeUpCopy: "Great learning today! Ask a grown-up when you’re ready for another session.",
    resultsTitle: "Adventure complete!",
    resultsCopy: "Effort makes your learning power grow.",
    score: "Correct",
    keepPlaying: "Choose another game",
    noLeaderboard: "Private by design · no public leaderboard · no ads",
    offline: "Offline play pack",
    synced: "Progress synced",
    loading: "Getting your adventure ready…",
    setupPin: "Create a 4-digit parent PIN",
    enterPin: "Enter parent PIN",
    pinHelp: "This keeps grown-up settings away from little hands.",
    unlock: "Unlock",
    createPin: "Create PIN",
    wrongPin: "That PIN did not match.",
    invalidPin: "Please enter exactly 4 digits.",
    lock: "Lock Parent Corner",
    parentOverview: "Learning overview",
    parentSettings: "Session settings",
    timeLimit: "Session time limit",
    audio: "Read questions aloud",
    timer: "Show countdown to child",
    language: "Kid-facing language",
    saveSettings: "Save settings",
    settingsSaved: "Parent settings saved.",
    mastery: "Mastery",
    attempts: "Games played",
    tricky: "Questions to retry",
    childSafety: "Child-safe promise",
    safetyCopy: "AI Chat stays learning-only and age-appropriate. There are no public ranks, ads, purchases, or file uploads in Kids Mode.",
    english: "English",
    hindi: "हिन्दी",
    moveUp: "Move up",
    moveDown: "Move down",
    selectFor: "Choose a match for",
    typeAnswer: "Type your answer",
    categoryFor: "Choose a group for",
    progress: "progress",
  },
  hi: {
    playLearn: "खेलो और सीखो",
    heroTitle: "एक दुनिया चुनो। अपना मिशन शुरू करो!",
    heroCopy: "जिज्ञासु छोटे विद्यार्थियों के लिए छोटे और मज़ेदार खेल।",
    stars: "सितारे",
    coins: "सिक्के",
    streak: "दिन की लड़ी",
    chooseLevel: "अपना सीखने का स्तर चुनो",
    adventureMap: "रोमांच का नक्शा",
    pickWorld: "खेल देखने के लिए विषय की दुनिया चुनो।",
    dailyMission: "आज का 5-मिनट मिशन",
    dailyCopy: "सिर्फ़ आपके लिए चुना गया थोड़ा-सा अभ्यास।",
    startMission: "मिशन शुरू करो",
    games: "खेल",
    bossRound: "बॉस राउंड",
    bossCopy: "विषय बैज जीतने के लिए सात चुनौती वाले सवाल।",
    play: "खेलो",
    retryPractice: "प्यार से फिर अभ्यास",
    retryCopy: "कठिन सवाल फिर करो—कोई अंक कभी नहीं कटेंगे।",
    practice: "गलतियाँ फिर आज़माओ",
    parentCorner: "अभिभावक कॉर्नर",
    grownUpsOnly: "सिर्फ़ बड़ों के लिए",
    backToMap: "नक्शे पर वापस",
    question: "सवाल",
    check: "उत्तर जाँचो",
    next: "अगला सवाल",
    finish: "मिशन पूरा करो",
    correct: "बहुत बढ़िया! सही उत्तर।",
    incorrect: "अच्छी कोशिश! इसे बाद में फिर अभ्यास करेंगे।",
    saved: "उत्तर सेव हो गया। आगे बढ़ो!",
    hint: "संकेत",
    readToMe: "पढ़कर सुनाओ",
    sessionTime: "खेलने का समय",
    minutesLeft: "मिनट बाकी",
    timeUp: "आज का खेलने का समय पूरा हुआ",
    timeUpCopy: "आज बहुत अच्छा सीखा! अगली बार के लिए किसी बड़े से पूछो।",
    resultsTitle: "मिशन पूरा हुआ!",
    resultsCopy: "मेहनत से सीखने की शक्ति बढ़ती है।",
    score: "सही",
    keepPlaying: "दूसरा खेल चुनो",
    noLeaderboard: "पूरी तरह निजी · कोई सार्वजनिक रैंक नहीं · कोई विज्ञापन नहीं",
    offline: "ऑफ़लाइन खेल पैक",
    synced: "प्रगति सिंक हुई",
    loading: "आपका मिशन तैयार हो रहा है…",
    setupPin: "4 अंकों का अभिभावक पिन बनाएँ",
    enterPin: "अभिभावक पिन डालें",
    pinHelp: "इससे बड़ों की सेटिंग बच्चों से सुरक्षित रहती है।",
    unlock: "खोलें",
    createPin: "पिन बनाएँ",
    wrongPin: "पिन सही नहीं है।",
    invalidPin: "कृपया ठीक 4 अंक डालें।",
    lock: "अभिभावक कॉर्नर लॉक करें",
    parentOverview: "सीखने का सार",
    parentSettings: "सेशन सेटिंग",
    timeLimit: "सेशन की समय सीमा",
    audio: "सवाल पढ़कर सुनाएँ",
    timer: "बच्चे को समय दिखाएँ",
    language: "बच्चे की भाषा",
    saveSettings: "सेटिंग सेव करें",
    settingsSaved: "अभिभावक सेटिंग सेव हो गई।",
    mastery: "समझ",
    attempts: "खेले गए खेल",
    tricky: "दोबारा करने वाले सवाल",
    childSafety: "बाल-सुरक्षा का वादा",
    safetyCopy: "AI चैट केवल पढ़ाई के लिए और उम्र के अनुकूल रहती है। किड्स मोड में सार्वजनिक रैंक, विज्ञापन, खरीदारी या फ़ाइल अपलोड नहीं हैं।",
    english: "English",
    hindi: "हिन्दी",
    moveUp: "ऊपर करें",
    moveDown: "नीचे करें",
    selectFor: "जोड़ी चुनें",
    typeAnswer: "अपना उत्तर लिखें",
    categoryFor: "समूह चुनें",
    progress: "प्रगति",
  },
};

function item(id, prompt, answer, extra = {}) {
  return { id, prompt, answer, ...extra };
}

const BASE_FALLBACK_KIDS_PACKS = [
  {
    id: "early-english-sounds",
    gradeBand: "early-years",
    subject: "English",
    gameType: "listen-pick",
    title: "Sound Safari",
    titleHi: "ध्वनि सफ़ारी",
    description: "Listen and find the letter or picture.",
    descriptionHi: "सुनो और सही अक्षर या चित्र चुनो।",
    topic: "Letter sounds",
    difficulty: "starter",
    estimatedMinutes: 3,
    items: [
      item("early-sound-a", "Which letter makes the sound ‘a’ as in apple?", "A", { promptHi: "कौन-सा अक्षर apple की ‘a’ ध्वनि बनाता है?", audioPrompt: "A as in apple", options: ["A", "M", "S"], emoji: "🍎" }),
      item("early-sound-b", "Pick the picture that starts with B.", "🐻 Bear", { promptHi: "B से शुरू होने वाला चित्र चुनो।", audioPrompt: "Which picture starts with B?", options: ["🐻 Bear", "🐱 Cat", "🐟 Fish"] }),
      item("early-sound-s", "Which letter begins the word sun?", "S", { promptHi: "sun शब्द किस अक्षर से शुरू होता है?", audioPrompt: "Which letter begins sun?", options: ["F", "S", "T"], emoji: "☀️" }),
    ],
  },
  {
    id: "early-english-picture",
    gradeBand: "early-years",
    subject: "English",
    gameType: "picture-choice",
    title: "Picture Word Picnic",
    titleHi: "चित्र-शब्द पिकनिक",
    description: "Match everyday pictures with simple words.",
    descriptionHi: "रोज़मर्रा के चित्रों को आसान शब्दों से मिलाओ।",
    topic: "First words",
    difficulty: "starter",
    estimatedMinutes: 3,
    items: [
      item("early-picture-cat", "Which word names this picture?", "Cat", { promptHi: "इस चित्र का नाम क्या है?", emoji: "🐱", options: ["Cat", "Sun", "Cup"] }),
      item("early-picture-ball", "Find the ball.", "⚽ Ball", { promptHi: "गेंद ढूँढो।", options: ["🌼 Flower", "⚽ Ball", "🚗 Car"] }),
      item("early-picture-red", "Which apple is red?", "🍎 Red apple", { promptHi: "कौन-सा सेब लाल है?", options: ["🍏 Green apple", "🍎 Red apple", "🍌 Banana"] }),
    ],
  },
  {
    id: "early-maths-count",
    gradeBand: "early-years",
    subject: "Maths",
    gameType: "count-tap",
    title: "Count the Stars",
    titleHi: "तारे गिनो",
    description: "Count friendly objects and tap the number.",
    descriptionHi: "चीज़ें गिनो और सही संख्या चुनो।",
    topic: "Counting to 10",
    difficulty: "starter",
    estimatedMinutes: 3,
    items: [
      item("early-count-3", "How many stars can you see?", "3", { promptHi: "कितने तारे दिख रहे हैं?", count: 3, countEmoji: "⭐", options: ["2", "3", "4"] }),
      item("early-count-5", "Count the ducks.", "5", { promptHi: "बतखों को गिनो।", count: 5, countEmoji: "🐥", options: ["4", "5", "6"] }),
      item("early-count-7", "How many balloons are here?", "7", { promptHi: "यहाँ कितने गुब्बारे हैं?", count: 7, countEmoji: "🎈", options: ["6", "7", "8"] }),
    ],
  },
  {
    id: "early-maths-shapes",
    gradeBand: "early-years",
    subject: "Maths",
    gameType: "sorting",
    title: "Shape Baskets",
    titleHi: "आकार की टोकरियाँ",
    description: "Put each shape in the right basket.",
    descriptionHi: "हर आकार को सही टोकरी में रखो।",
    topic: "Shapes",
    difficulty: "starter",
    estimatedMinutes: 4,
    items: [
      item("early-sort-shapes", "Choose the shape group for each object.", { "⚽ Ball": "Circle", "📕 Book": "Rectangle", "🪁 Kite": "Diamond" }, { promptHi: "हर चीज़ के लिए सही आकार चुनो।", sortableItems: ["⚽ Ball", "📕 Book", "🪁 Kite"], categories: ["Circle", "Rectangle", "Diamond"] }),
    ],
  },
  {
    id: "early-evs-match",
    gradeBand: "early-years",
    subject: "EVS",
    gameType: "matching",
    title: "Animal Homes",
    titleHi: "जानवरों के घर",
    description: "Help every animal find its home.",
    descriptionHi: "हर जानवर को उसका घर ढूँढने में मदद करो।",
    topic: "Animals",
    difficulty: "starter",
    estimatedMinutes: 4,
    items: [
      item("early-match-homes", "Match each animal to its home.", { "🐦 Bird": "Nest", "🐝 Bee": "Hive", "🐶 Dog": "Kennel" }, { promptHi: "हर जानवर को उसके घर से मिलाओ।", leftItems: ["🐦 Bird", "🐝 Bee", "🐶 Dog"], rightItems: ["Kennel", "Nest", "Hive"] }),
    ],
  },
  {
    id: "early-evs-sequence",
    gradeBand: "early-years",
    subject: "EVS",
    gameType: "sequence",
    title: "Grow a Plant",
    titleHi: "पौधा उगाओ",
    description: "Put a plant’s growing steps in order.",
    descriptionHi: "पौधे के बढ़ने के चरण क्रम में लगाओ।",
    topic: "Plants",
    difficulty: "starter",
    estimatedMinutes: 3,
    items: [
      item("early-sequence-plant", "What happens first, next and last?", ["🌰 Seed", "🌱 Sprout", "🌻 Flower"], { promptHi: "पहले, फिर और आखिर में क्या होता है?", sequenceItems: ["🌻 Flower", "🌰 Seed", "🌱 Sprout"] }),
    ],
  },
  {
    id: "junior-english-scramble",
    gradeBand: "class1-2",
    subject: "English",
    gameType: "scramble",
    title: "Word Builder",
    titleHi: "शब्द बनाओ",
    description: "Unscramble letters to build familiar words.",
    descriptionHi: "अक्षरों को जोड़कर जाने-पहचाने शब्द बनाओ।",
    topic: "Spelling",
    difficulty: "easy",
    estimatedMinutes: 4,
    items: [
      item("junior-scramble-cat", "Build the word for 🐱", "CAT", { promptHi: "🐱 के लिए शब्द बनाओ", scrambled: "TAC", hint: "It begins with C." }),
      item("junior-scramble-book", "Build the word for 📘", "BOOK", { promptHi: "📘 के लिए शब्द बनाओ", scrambled: "KOOB", hint: "It begins with B." }),
      item("junior-scramble-fish", "Build the word for 🐟", "FISH", { promptHi: "🐟 के लिए शब्द बनाओ", scrambled: "HSIF", hint: "It begins with F." }),
    ],
  },
  {
    id: "junior-english-sentence",
    gradeBand: "class1-2",
    subject: "English",
    gameType: "sequence",
    title: "Sentence Train",
    titleHi: "वाक्य की रेल",
    description: "Move word carriages into a clear sentence.",
    descriptionHi: "शब्दों को सही क्रम में लगाकर वाक्य बनाओ।",
    topic: "Sentences",
    difficulty: "easy",
    estimatedMinutes: 4,
    items: [
      item("junior-sequence-bird", "Build the sentence.", ["The", "bird", "can", "fly."], { promptHi: "वाक्य बनाओ।", sequenceItems: ["fly.", "bird", "The", "can"] }),
      item("junior-sequence-sun", "Build the sentence.", ["The", "sun", "is", "bright."], { promptHi: "वाक्य बनाओ।", sequenceItems: ["bright.", "is", "The", "sun"] }),
    ],
  },
  {
    id: "junior-maths-quest",
    gradeBand: "class1-2",
    subject: "Maths",
    gameType: "mcq",
    title: "Number Treasure",
    titleHi: "अंकों का खज़ाना",
    description: "Solve quick number clues to open the chest.",
    descriptionHi: "खज़ाना खोलने के लिए छोटे सवाल हल करो।",
    topic: "Addition and subtraction",
    difficulty: "easy",
    estimatedMinutes: 4,
    items: [
      item("junior-maths-add", "8 + 5 = ?", "13", { options: ["11", "12", "13", "14"], hint: "Start at 8 and count on 5." }),
      item("junior-maths-sub", "15 − 6 = ?", "9", { options: ["8", "9", "10", "11"], hint: "Count back six steps." }),
      item("junior-maths-double", "What is double 7?", "14", { promptHi: "7 का दोगुना क्या है?", options: ["12", "13", "14", "15"] }),
    ],
  },
  {
    id: "junior-maths-sort",
    gradeBand: "class1-2",
    subject: "Maths",
    gameType: "sorting",
    title: "Odd or Even Lab",
    titleHi: "विषम या सम प्रयोगशाला",
    description: "Sort each number into the right machine.",
    descriptionHi: "हर संख्या को सही मशीन में डालो।",
    topic: "Odd and even",
    difficulty: "easy",
    estimatedMinutes: 4,
    items: [
      item("junior-sort-odd-even", "Choose Odd or Even for every number.", { "2": "Even", "5": "Odd", "8": "Even", "11": "Odd" }, { promptHi: "हर संख्या के लिए विषम या सम चुनो।", sortableItems: ["2", "5", "8", "11"], categories: ["Odd", "Even"] }),
    ],
  },
  {
    id: "junior-evs-match",
    gradeBand: "class1-2",
    subject: "EVS",
    gameType: "matching",
    title: "Living World Links",
    titleHi: "जीव-जगत की जोड़ियाँ",
    description: "Connect living things with what they need.",
    descriptionHi: "जीवों को उनकी ज़रूरतों से मिलाओ।",
    topic: "Living things",
    difficulty: "easy",
    estimatedMinutes: 4,
    items: [
      item("junior-evs-needs", "Match each living thing to what it needs most.", { "🌱 Plant": "Sunlight", "🐟 Fish": "Water", "🐄 Cow": "Grass" }, { promptHi: "हर जीव को उसकी ज़रूरत से मिलाओ।", leftItems: ["🌱 Plant", "🐟 Fish", "🐄 Cow"], rightItems: ["Water", "Grass", "Sunlight"] }),
    ],
  },
  {
    id: "junior-evs-choice",
    gradeBand: "class1-2",
    subject: "EVS",
    gameType: "picture-choice",
    title: "Healthy Habits Hero",
    titleHi: "स्वस्थ आदतों के हीरो",
    description: "Choose habits that keep your body happy.",
    descriptionHi: "शरीर को स्वस्थ रखने वाली आदतें चुनो।",
    topic: "Health and hygiene",
    difficulty: "easy",
    estimatedMinutes: 3,
    items: [
      item("junior-health-hands", "What should you do before eating?", "🧼 Wash hands", { promptHi: "खाने से पहले क्या करना चाहिए?", options: ["🧼 Wash hands", "🎮 Play a game", "👟 Wear shoes"] }),
      item("junior-health-teeth", "What helps keep teeth clean?", "🪥 Brushing", { promptHi: "दाँत साफ़ रखने में क्या मदद करता है?", options: ["🍬 Sweets", "🪥 Brushing", "📺 Television"] }),
    ],
  },
  {
    id: "middle-english-grammar",
    gradeBand: "class3-5",
    subject: "English",
    gameType: "mcq",
    title: "Grammar Galaxy",
    titleHi: "ग्रामर गैलेक्सी",
    description: "Power the spaceship with grammar choices.",
    descriptionHi: "सही व्याकरण से अंतरिक्षयान चलाओ।",
    topic: "Grammar",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-grammar-verb", "Which word is the verb? ‘The puppy chased the ball.’", "chased", { promptHi: "क्रिया कौन-सी है? ‘The puppy chased the ball.’", options: ["puppy", "chased", "ball", "the"] }),
      item("middle-grammar-plural", "Choose the correct plural of ‘child’.", "children", { promptHi: "‘child’ का सही बहुवचन चुनो।", options: ["childs", "children", "childes", "childrens"] }),
      item("middle-grammar-tense", "Complete: Yesterday, Meera ___ to school.", "walked", { promptHi: "पूरा करो: Yesterday, Meera ___ to school.", options: ["walk", "walks", "walked", "walking"] }),
    ],
  },
  {
    id: "middle-english-sequence",
    gradeBand: "class3-5",
    subject: "English",
    gameType: "sequence",
    title: "Story Order Quest",
    titleHi: "कहानी क्रम मिशन",
    description: "Arrange story events so they make sense.",
    descriptionHi: "कहानी की घटनाओं को सही क्रम में लगाओ।",
    topic: "Comprehension",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-story-sequence", "Put the morning events in a sensible order.", ["Ria woke up.", "She brushed her teeth.", "She ate breakfast.", "She left for school."], { promptHi: "सुबह की घटनाएँ सही क्रम में लगाओ।", sequenceItems: ["She ate breakfast.", "She left for school.", "Ria woke up.", "She brushed her teeth."] }),
    ],
  },
  {
    id: "middle-maths-multiply",
    gradeBand: "class3-5",
    subject: "Maths",
    gameType: "mcq",
    title: "Multiplication Mountain",
    titleHi: "गुणा पर्वत",
    description: "Solve each clue to climb higher.",
    descriptionHi: "ऊपर चढ़ने के लिए हर सवाल हल करो।",
    topic: "Multiplication",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-maths-6x7", "6 × 7 = ?", "42", { options: ["36", "40", "42", "48"] }),
      item("middle-maths-groups", "There are 5 bags with 8 marbles each. How many marbles?", "40", { promptHi: "5 थैलों में 8-8 कंचे हैं। कुल कितने कंचे?", options: ["35", "40", "45", "48"] }),
      item("middle-maths-divide", "54 ÷ 6 = ?", "9", { options: ["7", "8", "9", "10"] }),
    ],
  },
  {
    id: "middle-maths-fractions",
    gradeBand: "class3-5",
    subject: "Maths",
    gameType: "matching",
    title: "Fraction Friends",
    titleHi: "भिन्न के दोस्त",
    description: "Match each fraction with an equal form.",
    descriptionHi: "हर भिन्न को उसके बराबर रूप से मिलाओ।",
    topic: "Fractions",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-fraction-match", "Match each fraction with its equal form.", { "1/2": "2/4", "1/3": "2/6", "3/4": "6/8" }, { promptHi: "हर भिन्न को उसके बराबर रूप से मिलाओ।", leftItems: ["1/2", "1/3", "3/4"], rightItems: ["6/8", "2/6", "2/4"] }),
    ],
  },
  {
    id: "middle-science-match",
    gradeBand: "class3-5",
    subject: "Science",
    gameType: "matching",
    title: "Science Lab Links",
    titleHi: "विज्ञान की जोड़ियाँ",
    description: "Connect organs, forces and materials.",
    descriptionHi: "अंगों, बलों और पदार्थों की जोड़ियाँ मिलाओ।",
    topic: "Science foundations",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-science-organs", "Match each organ to its main job.", { "Heart": "Pumps blood", "Lungs": "Help us breathe", "Stomach": "Digests food" }, { promptHi: "हर अंग को उसके मुख्य काम से मिलाओ।", leftItems: ["Heart", "Lungs", "Stomach"], rightItems: ["Digests food", "Pumps blood", "Help us breathe"] }),
    ],
  },
  {
    id: "middle-science-sequence",
    gradeBand: "class3-5",
    subject: "Science",
    gameType: "sequence",
    title: "Water Cycle Relay",
    titleHi: "जल चक्र रिले",
    description: "Put the water cycle stages in order.",
    descriptionHi: "जल चक्र के चरण सही क्रम में लगाओ।",
    topic: "Water cycle",
    difficulty: "medium",
    estimatedMinutes: 4,
    items: [
      item("middle-water-cycle", "Arrange the water cycle.", ["Evaporation", "Condensation", "Precipitation", "Collection"], { promptHi: "जल चक्र को क्रम में लगाओ।", sequenceItems: ["Collection", "Condensation", "Evaporation", "Precipitation"] }),
    ],
  },
  {
    id: "middle-social-map",
    gradeBand: "class3-5",
    subject: "Social",
    gameType: "mcq",
    title: "India Explorer",
    titleHi: "भारत की खोज",
    description: "Travel through landmarks, directions and civics.",
    descriptionHi: "स्थलों, दिशाओं और नागरिक शास्त्र की यात्रा करो।",
    topic: "India and maps",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-social-capital", "What is the capital of India?", "New Delhi", { promptHi: "भारत की राजधानी क्या है?", options: ["Mumbai", "New Delhi", "Kolkata", "Chennai"] }),
      item("middle-social-direction", "On most maps, which direction is at the top?", "North", { promptHi: "अधिकतर नक्शों में ऊपर कौन-सी दिशा होती है?", options: ["East", "West", "North", "South"] }),
      item("middle-social-vote", "Who chooses representatives in a democracy?", "Citizens", { promptHi: "लोकतंत्र में प्रतिनिधि कौन चुनता है?", options: ["Only teachers", "Citizens", "Only judges", "Visitors"] }),
    ],
  },
  {
    id: "middle-social-sort",
    gradeBand: "class3-5",
    subject: "Social",
    gameType: "sorting",
    title: "Resource Ranger",
    titleHi: "संसाधन रेंजर",
    description: "Sort resources into renewable and non-renewable.",
    descriptionHi: "संसाधनों को नवीकरणीय और अनवीकरणीय में बाँटो।",
    topic: "Natural resources",
    difficulty: "medium",
    estimatedMinutes: 5,
    items: [
      item("middle-resource-sort", "Choose the right group for each resource.", { "Sunlight": "Renewable", "Wind": "Renewable", "Coal": "Non-renewable", "Petroleum": "Non-renewable" }, { promptHi: "हर संसाधन के लिए सही समूह चुनो।", sortableItems: ["Sunlight", "Coal", "Wind", "Petroleum"], categories: ["Renewable", "Non-renewable"] }),
    ],
  },
];

function quizQuestion(id, prompt, answer, options, extra = {}) {
  return item(id, prompt, answer, { options, ...extra });
}

function supplementalPack(id, gradeBand, subject, title, topic, difficulty, questions) {
  return {
    id,
    gradeBand,
    subject,
    gameType: "mcq",
    title,
    description: "A larger question trail with a fresh selection each day.",
    topic,
    difficulty,
    estimatedMinutes: 5,
    dailyQuestionCount: 5,
    items: questions.map(([questionId, prompt, answer, options, hint]) => (
      quizQuestion(`${id}-${questionId}`, prompt, answer, options, hint ? { hint } : {})
    )),
  };
}

const SUPPLEMENTAL_KIDS_PACKS = [
  supplementalPack("early-english-rainbow", "early-years", "English", "Letter Rainbow", "Letters and words", "starter", [
    ["vowel", "Which one is a vowel?", "A", ["A", "B", "T", "M"]],
    ["moon", "Which word starts with M?", "Moon", ["Sun", "Moon", "Cat", "Fish"]],
    ["cat", "Which word rhymes with cat?", "Hat", ["Cup", "Hat", "Dog", "Pen"]],
    ["ending", "Which letter ends the word sun?", "N", ["S", "U", "N", "M"]],
    ["small", "Choose the small letter for B.", "b", ["d", "p", "b", "q"]],
    ["apple", "Which word begins with the same sound as apple?", "Ant", ["Ball", "Ant", "Sun", "Top"]],
    ["word", "Which is a complete word?", "DOG", ["DGO", "GOD", "DOG", "ODG"]],
  ]),
  supplementalPack("early-maths-rainbow", "early-years", "Maths", "Number Rainbow", "Counting and shapes", "starter", [
    ["after", "What number comes after 4?", "5", ["3", "4", "5", "6"]],
    ["before", "What number comes before 7?", "6", ["5", "6", "7", "8"]],
    ["sum", "2 + 3 = ?", "5", ["4", "5", "6", "7"]],
    ["take", "You have 5 stars and give away 1. How many remain?", "4", ["3", "4", "5", "6"]],
    ["corners", "Which shape has three corners?", "Triangle", ["Circle", "Square", "Triangle", "Oval"]],
    ["largest", "Which number is the largest?", "9", ["3", "6", "9", "4"]],
    ["pattern", "Complete the pattern: 1, 2, 1, 2, __", "1", ["1", "2", "3", "4"]],
  ]),
  supplementalPack("early-evs-rainbow", "early-years", "EVS", "Little World Rainbow", "Everyday environment", "starter", [
    ["water", "What do we drink when we are thirsty?", "Water", ["Sand", "Water", "Paper", "Stone"]],
    ["plant", "Which part of a plant grows under the soil?", "Root", ["Flower", "Leaf", "Root", "Fruit"]],
    ["night", "What can we often see in the night sky?", "Moon", ["Moon", "Rainbow", "Butterfly", "Tree"]],
    ["bird", "Which animal has feathers?", "Bird", ["Fish", "Bird", "Cat", "Frog"]],
    ["clean", "Where should litter go?", "Bin", ["Road", "River", "Bin", "Garden"]],
    ["sense", "Which body part helps us smell?", "Nose", ["Ear", "Nose", "Hand", "Foot"]],
    ["season", "What keeps us dry in rain?", "Umbrella", ["Spoon", "Umbrella", "Pillow", "Plate"]],
  ]),
  supplementalPack("junior-english-explorer", "class1-2", "English", "English Explorer", "Vocabulary and grammar", "easy", [
    ["opposite", "Choose the opposite of tall.", "Short", ["Long", "Short", "Wide", "Fast"]],
    ["plural", "Choose the plural of box.", "Boxes", ["Boxs", "Boxes", "Boxies", "Box"]],
    ["verb", "Which word is an action?", "Jump", ["Blue", "Jump", "Chair", "Soft"]],
    ["article", "Complete: I saw __ elephant.", "an", ["a", "an", "thee", "and"]],
    ["punctuation", "Which mark ends a question?", "?", [".", ",", "?", "!"]],
    ["sentence", "Which is a complete sentence?", "The dog runs.", ["Dog the", "The dog runs.", "Runs dog", "The runs"]],
    ["past", "What is the past tense of play?", "Played", ["Playing", "Plays", "Played", "Playd"]],
  ]),
  supplementalPack("junior-maths-explorer", "class1-2", "Maths", "Maths Explorer", "Number sense", "easy", [
    ["add", "17 + 6 = ?", "23", ["21", "22", "23", "24"]],
    ["subtract", "24 - 9 = ?", "15", ["13", "14", "15", "16"]],
    ["tens", "How many tens are in 40?", "4", ["2", "3", "4", "5"]],
    ["skip", "Count by twos: 2, 4, 6, __", "8", ["7", "8", "9", "10"]],
    ["coins", "Two coins worth 5 each make?", "10", ["7", "8", "10", "12"]],
    ["compare", "Which number is smaller?", "36", ["63", "46", "36", "56"]],
    ["double", "What is double 9?", "18", ["16", "17", "18", "19"]],
  ]),
  supplementalPack("junior-evs-explorer", "class1-2", "EVS", "Earth Explorer", "Health and environment", "easy", [
    ["healthy", "Which is a healthy snack?", "Fruit", ["Fruit", "Candy", "Chips", "Soda"]],
    ["water", "Which action saves water?", "Turn off the tap", ["Leave the tap running", "Turn off the tap", "Spill water", "Wash one toy for an hour"]],
    ["animal", "Which animal lives in water?", "Dolphin", ["Camel", "Dolphin", "Lion", "Horse"]],
    ["plant", "What do leaves use from sunlight?", "Energy", ["Noise", "Energy", "Plastic", "Dust"]],
    ["sense", "Which sense helps us hear music?", "Hearing", ["Taste", "Touch", "Hearing", "Smell"]],
    ["traffic", "What should we do at a red traffic light?", "Stop", ["Run", "Stop", "Jump", "Turn around"]],
    ["waste", "Which item can be recycled?", "Paper", ["Smoke", "Paper", "Dirty water", "Food smell"]],
  ]),
  supplementalPack("middle-english-explorer", "class3-5", "English", "Language Explorer", "Grammar and comprehension", "medium", [
    ["adjective", "Which word is the adjective: The bright kite flew?", "bright", ["The", "bright", "kite", "flew"]],
    ["pronoun", "Replace Riya with a pronoun: Riya reads daily.", "She", ["He", "It", "She", "They"]],
    ["subject", "What is the subject in: Birds build nests?", "Birds", ["build", "nests", "Birds", "build nests"]],
    ["comma", "Which sentence uses a comma correctly?", "I bought apples, pears and grapes.", ["I bought, apples pears and grapes.", "I bought apples, pears and grapes.", "I, bought apples pears and grapes.", "I bought apples pears, and, grapes."]],
    ["synonym", "Choose a synonym for quick.", "Rapid", ["Slow", "Rapid", "Quiet", "Heavy"]],
    ["inference", "Maya took an umbrella and wore boots. What was likely happening?", "It was raining", ["It was snowing", "It was raining", "It was bedtime", "It was very hot"]],
    ["tense", "Choose the future-tense sentence.", "We will visit the museum.", ["We visited the museum.", "We visit the museum.", "We will visit the museum.", "We are at the museum."]],
  ]),
  supplementalPack("middle-maths-explorer", "class3-5", "Maths", "Problem Solver Trail", "Reasoning", "medium", [
    ["multiply", "9 x 7 = ?", "63", ["54", "56", "63", "72"]],
    ["divide", "72 divided by 8 = ?", "9", ["7", "8", "9", "10"]],
    ["fraction", "Which fraction equals one half?", "3/6", ["2/3", "3/6", "4/6", "5/6"]],
    ["perimeter", "A square has sides of 5 cm. What is its perimeter?", "20 cm", ["10 cm", "15 cm", "20 cm", "25 cm"]],
    ["place", "What is the value of 6 in 4,682?", "600", ["6", "60", "600", "6000"]],
    ["time", "What time is 45 minutes after 2:30?", "3:15", ["2:75", "3:00", "3:15", "3:30"]],
    ["remainder", "20 sweets shared equally among 3 children leave how many?", "2", ["0", "1", "2", "3"]],
  ]),
  supplementalPack("middle-science-explorer", "class3-5", "Science", "Science Explorer", "Science reasoning", "medium", [
    ["state", "Which change turns liquid water into gas?", "Evaporation", ["Freezing", "Melting", "Evaporation", "Condensation"]],
    ["force", "Which force pulls objects toward Earth?", "Gravity", ["Magnetism", "Gravity", "Friction", "Electricity"]],
    ["food", "Which organism makes its own food?", "Green plant", ["Tiger", "Mushroom", "Green plant", "Human"]],
    ["shadow", "A shadow forms when light is?", "Blocked", ["Stored", "Blocked", "Frozen", "Heard"]],
    ["material", "Which material is a good conductor of heat?", "Metal", ["Wood", "Plastic", "Metal", "Rubber"]],
    ["organ", "Which organ sends messages through nerves?", "Brain", ["Heart", "Lungs", "Brain", "Stomach"]],
    ["habitat", "Webbed feet help ducks mainly to?", "Swim", ["Climb", "Swim", "Dig", "Fly at night"]],
  ]),
  supplementalPack("middle-social-explorer", "class3-5", "Social", "Community Explorer", "Maps and civics", "medium", [
    ["map", "What does a map key explain?", "Symbols", ["Weather", "Symbols", "Stories", "Prices"]],
    ["direction", "Which direction is opposite east?", "West", ["North", "South", "West", "Up"]],
    ["local", "Who helps manage services in a city?", "Municipal body", ["Sports team", "Municipal body", "Shopkeeper", "Tourist"]],
    ["rights", "Which is a responsibility of a citizen?", "Follow laws", ["Ignore rules", "Follow laws", "Waste water", "Damage parks"]],
    ["landform", "A high area with a flat top is a?", "Plateau", ["Island", "Plateau", "Valley", "River"]],
    ["scale", "A map scale helps us understand?", "Distance", ["Taste", "Distance", "Sound", "Temperature"]],
    ["heritage", "Why do we protect monuments?", "They preserve history", ["They block roads", "They preserve history", "They make rain", "They grow food"]],
  ]),
];

export const FALLBACK_KIDS_PACKS = Object.freeze([
  ...BASE_FALLBACK_KIDS_PACKS,
  ...SUPPLEMENTAL_KIDS_PACKS,
]);

function bossQuestionSet(prefix, rows) {
  return rows.map(([id, prompt, answer, options, hint]) => (
    quizQuestion(`${prefix}-${id}`, prompt, answer, options, {
      ...(hint ? { hint } : {}),
      bossQuestion: true,
    })
  ));
}

const BOSS_KIDS_QUESTION_BANKS = Object.freeze({
  "early-years:English": bossQuestionSet("boss-early-english", [
    ["blend", "Which word starts with the sound 'sh'?", "Ship", ["Sun", "Ship", "Cat", "Map"]],
    ["rhyme", "Which pair rhymes?", "Cake and lake", ["Cake and lake", "Dog and sun", "Pen and fish", "Book and ball"]],
    ["middle", "Which letter is in the middle of CAT?", "A", ["C", "A", "T", "S"]],
    ["missing", "Choose the missing letter: D_G", "O", ["A", "E", "I", "O"]],
    ["sound", "Which word begins with a different sound?", "Moon", ["Ball", "Bat", "Moon", "Book"]],
    ["ending", "Which two words end with the same sound?", "Sun and fun", ["Sun and fun", "Cat and cup", "Dog and pen", "Fish and ball"]],
    ["order", "Which word comes first in alphabet order?", "Ant", ["Dog", "Cat", "Ball", "Ant"]],
  ]),
  "early-years:Maths": bossQuestionSet("boss-early-maths", [
    ["missing", "Find the missing number: 2, 4, __, 8", "6", ["5", "6", "7", "8"]],
    ["make", "Which two numbers make 7?", "3 and 4", ["1 and 4", "2 and 3", "3 and 4", "4 and 4"]],
    ["difference", "How many more is 8 than 5?", "3", ["2", "3", "4", "5"]],
    ["shape", "Which shape has four equal sides?", "Square", ["Rectangle", "Triangle", "Square", "Circle"]],
    ["pattern", "Complete: circle, square, circle, square, __", "Circle", ["Triangle", "Circle", "Star", "Oval"]],
    ["groups", "Three pairs of socks contain how many socks?", "6", ["3", "4", "5", "6"]],
    ["story", "Mina has 4 red beads and 3 blue beads. How many altogether?", "7", ["5", "6", "7", "8"]],
  ]),
  "early-years:EVS": bossQuestionSet("boss-early-evs", [
    ["young", "A baby frog is called a?", "Tadpole", ["Cub", "Calf", "Tadpole", "Chick"]],
    ["grow", "What does a seed need to begin growing?", "Water", ["Plastic", "Water", "Paint", "Stone"]],
    ["day", "Which animal is often awake at night?", "Owl", ["Butterfly", "Owl", "Cow", "Sparrow"]],
    ["float", "Which object is most likely to float?", "Dry leaf", ["Metal key", "Stone", "Dry leaf", "Coin"]],
    ["sense", "Which sense warns us that food is burning?", "Smell", ["Taste", "Smell", "Touch", "Sight only"]],
    ["care", "What is the kindest way to treat a pet?", "Give food, water and care", ["Pull its tail", "Give food, water and care", "Leave it in the sun", "Make loud noises"]],
    ["weather", "Dark clouds and thunder often mean?", "A storm may come", ["Snow is melting", "A storm may come", "Night is ending", "Summer is over"]],
  ]),
  "class1-2:English": bossQuestionSet("boss-junior-english", [
    ["subject", "Choose the subject in: The little rabbit hops.", "The little rabbit", ["hops", "little", "The little rabbit", "rabbit hops"]],
    ["because", "Complete: Tara carried an umbrella __ it was raining.", "because", ["but", "because", "or", "after"]],
    ["plural", "Choose the correct plural of baby.", "babies", ["babys", "babyes", "babies", "babyes"]],
    ["possessive", "Which sentence shows that the ball belongs to Ria?", "It is Ria's ball.", ["It is Rias ball.", "It is Ria ball.", "It is Ria's ball.", "It is Rias' ball."]],
    ["order", "Which sentence has the words in the best order?", "The happy children sang loudly.", ["Happy the loudly children sang.", "The happy children sang loudly.", "Children the sang happy loudly.", "Loudly happy the sang children."]],
    ["meaning", "If a path is narrow, it is?", "Not wide", ["Very loud", "Not wide", "Very long", "Not clean"]],
    ["punctuation", "Which sentence is punctuated correctly?", "Wow! That kite is high.", ["Wow, That kite is high?", "Wow! That kite is high.", "Wow That kite is high", "Wow? that kite is high!"]],
  ]),
  "class1-2:Maths": bossQuestionSet("boss-junior-maths", [
    ["twostep", "A box has 18 crayons. 5 are used and 4 are added. How many now?", "17", ["9", "13", "17", "27"]],
    ["unknown", "Which number makes 9 + __ = 15?", "6", ["5", "6", "7", "8"]],
    ["difference", "What is the difference between 32 and 18?", "14", ["12", "13", "14", "15"]],
    ["groups", "There are 4 plates with 3 biscuits each. How many biscuits?", "12", ["7", "10", "12", "14"]],
    ["place", "Which number has 5 tens and 8 ones?", "58", ["508", "85", "58", "13"]],
    ["time", "School starts at 8:30. One hour later it is?", "9:30", ["8:31", "9:00", "9:30", "10:30"]],
    ["pattern", "Continue: 5, 10, 15, 20, __", "25", ["21", "22", "24", "25"]],
  ]),
  "class1-2:EVS": bossQuestionSet("boss-junior-evs", [
    ["chain", "Which food chain begins correctly?", "Grass -> deer -> tiger", ["Tiger -> grass -> deer", "Grass -> deer -> tiger", "Deer -> tiger -> grass", "Grass -> tiger -> deer"]],
    ["germ", "What best stops germs spreading before meals?", "Wash hands with soap", ["Wipe hands on clothes", "Wash hands with soap", "Touch the floor", "Share a towel"]],
    ["resource", "Which resource can run out if we waste it?", "Clean water", ["Sunlight", "Wind", "Clean water", "Fresh air outdoors"]],
    ["adapt", "Why does a camel have broad feet?", "To walk on sand", ["To climb trees", "To walk on sand", "To swim faster", "To fly"]],
    ["community", "Who should we call when there is a fire?", "Fire service", ["Post office", "Fire service", "Library", "Bank"]],
    ["cycle", "What happens after water vapour cools?", "It condenses into drops", ["It becomes soil", "It condenses into drops", "It catches fire", "It disappears forever"]],
    ["waste", "Which action makes the least waste?", "Use a refillable bottle", ["Use a new plastic cup each time", "Use a refillable bottle", "Throw paper on the road", "Leave lunch uneaten"]],
  ]),
  "class3-5:English": bossQuestionSet("boss-middle-english", [
    ["clause", "Choose the best joining word: I stayed inside __ the storm was strong.", "because", ["although", "because", "unless", "before"]],
    ["agreement", "Which sentence has correct subject-verb agreement?", "The basket of apples is heavy.", ["The basket of apples are heavy.", "The basket of apples is heavy.", "The baskets of apple is heavy.", "The basket are heavy."]],
    ["inference", "Aman whispered and pointed to the sleeping baby. Why did he whisper?", "He did not want to wake the baby", ["He had lost his voice", "He did not want to wake the baby", "He was outdoors", "He was reading a map"]],
    ["figurative", "In 'The stars danced', danced makes the stars seem?", "Human", ["Tiny", "Human", "Silent", "Square"]],
    ["prefix", "Which prefix changes possible to its opposite?", "im-", ["re-", "un-", "im-", "pre-"]],
    ["editing", "Choose the correctly edited sentence.", "After lunch, we visited the library.", ["after lunch we visited, the library.", "After lunch, we visited the library.", "After Lunch we Visited the library", "After lunch we visited the library?"]],
    ["summary", "A good summary should include?", "The main idea and key details", ["Every single word", "Only the title", "The main idea and key details", "Unrelated opinions"]],
  ]),
  "class3-5:Maths": bossQuestionSet("boss-middle-maths", [
    ["fraction", "What is 3/4 of 28?", "21", ["7", "14", "21", "24"]],
    ["multistep", "A bus has 48 seats. 37 are filled, then 6 people leave. How many are filled?", "31", ["5", "31", "42", "43"]],
    ["area", "A rectangle is 9 cm long and 4 cm wide. Its area is?", "36 sq cm", ["13 sq cm", "26 sq cm", "36 sq cm", "40 sq cm"]],
    ["division", "A baker packs 84 buns equally into 7 trays. How many per tray?", "12", ["10", "11", "12", "14"]],
    ["decimal", "Which is greatest?", "0.75", ["0.57", "0.7", "0.75", "0.705"]],
    ["angle", "An angle smaller than a right angle is?", "Acute", ["Obtuse", "Straight", "Acute", "Reflex"]],
    ["pattern", "What is the next number: 3, 6, 12, 24, __?", "48", ["30", "36", "42", "48"]],
  ]),
  "class3-5:Science": bossQuestionSet("boss-middle-science", [
    ["system", "Which two systems work together to move oxygen around the body?", "Respiratory and circulatory", ["Digestive and skeletal", "Respiratory and circulatory", "Nervous and digestive", "Skeletal and excretory"]],
    ["circuit", "A bulb in a simple circuit lights only when the circuit is?", "Closed", ["Open", "Closed", "Wet", "Painted"]],
    ["mixture", "Which method separates sand from water?", "Filtration", ["Melting", "Filtration", "Freezing", "Magnetism"]],
    ["adaptation", "Why do cactus leaves form spines?", "To reduce water loss", ["To make more shade", "To reduce water loss", "To absorb noise", "To attract snow"]],
    ["force", "Friction usually acts in which direction?", "Opposite to motion", ["With motion", "Opposite to motion", "Only upward", "Only downward"]],
    ["energy", "Which change converts electrical energy mainly to light?", "A glowing bulb", ["A rolling ball", "A growing plant", "A glowing bulb", "A falling stone"]],
    ["ecosystem", "If insects disappear from a food web, insect-eating birds may?", "Have less food", ["Have more food", "Have less food", "Become plants", "Stop needing water"]],
  ]),
  "class3-5:Social": bossQuestionSet("boss-middle-social", [
    ["coordinates", "Lines of latitude mainly measure distance north or south of?", "The Equator", ["The Prime Meridian", "The Equator", "The poles only", "A coastline"]],
    ["government", "Why are local governments important?", "They solve nearby community needs", ["They control all countries", "They solve nearby community needs", "They write school exams", "They predict every storm"]],
    ["source", "Which is a primary historical source?", "A letter written at the time", ["A modern cartoon about it", "A letter written at the time", "A recent summary", "A fictional story"]],
    ["scale", "On a map, 1 cm represents 10 km. What does 4 cm represent?", "40 km", ["4 km", "14 km", "40 km", "400 km"]],
    ["democracy", "A secret ballot protects a voter's?", "Privacy of choice", ["Travel plans", "Job title", "Privacy of choice", "Address from maps"]],
    ["resource", "Which choice supports sustainable use of forests?", "Replant trees after harvesting", ["Cut every tree", "Replant trees after harvesting", "Burn forest waste openly", "Build only concrete areas"]],
    ["diversity", "Why can festivals differ across regions?", "Communities have varied histories and traditions", ["All regions have identical weather", "Communities have varied histories and traditions", "Maps change each week", "Laws require different food"]],
  ]),
});

function localDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : new Date(value);
  const safe = Number.isFinite(date.getTime()) ? date : new Date();
  return [
    safe.getFullYear(),
    String(safe.getMonth() + 1).padStart(2, "0"),
    String(safe.getDate()).padStart(2, "0"),
  ].join("-");
}

function stableKidsHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectKidsDailyItems(items, {
  count = 5,
  localDate = new Date(),
  scope = "kids",
} = {}) {
  const candidates = Array.isArray(items) ? items.filter(Boolean) : [];
  if (candidates.length <= 1) return [...candidates];
  const safeCount = Math.max(1, Math.min(candidates.length, Number(count) || 1));
  const date = localDateKey(localDate);
  const dayNumber = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000);
  const start = (stableKidsHash(scope) + dayNumber) % candidates.length;
  return Array.from({ length: safeCount }, (_, offset) => (
    candidates[(start + offset) % candidates.length]
  ));
}

export function reconcileKidsPacks(localPacks = [], serverPacks = []) {
  const local = (Array.isArray(localPacks) ? localPacks : []).filter((pack) => pack?.id);
  const server = (Array.isArray(serverPacks) ? serverPacks : []).filter((pack) => pack?.id);
  const serverById = new Map(server.map((pack) => [String(pack.id), pack]));
  const reconciled = local.map((pack) => {
    const serverPack = serverById.get(String(pack.id));
    if (!serverPack) return pack;
    serverById.delete(String(pack.id));
    return serverPack;
  });
  server.forEach((pack) => {
    if (serverById.delete(String(pack.id))) reconciled.push(pack);
  });
  return reconciled;
}

export function getKidsCopy(language = "en") {
  return KIDS_UI[language] || KIDS_UI.en;
}

export function getLocalized(value, language = "en", field = "label") {
  if (!value || typeof value !== "object") return "";
  return String(language === "hi" ? value[`${field}Hi`] || value[field] : value[field] || "");
}

export function getKidsAgeBand(academicLevel = "") {
  const value = String(academicLevel || "").trim().toLowerCase();
  if (/nursery|kindergarten|\blkg\b|\bukg\b|pre[ -]?school|early/.test(value)) return "early-years";
  const match = value.match(/(?:class|grade|standard|std\.?|कक्षा)\s*([1-5])/i);
  if (match) return Number(match[1]) <= 2 ? "class1-2" : "class3-5";
  if (/primary/.test(value)) return "class1-2";
  return "class1-2";
}

export function getFallbackKidsPacks(gradeBand, subject, localDate = null) {
  const packs = FALLBACK_KIDS_PACKS.filter((pack) => (
    (!gradeBand || pack.gradeBand === gradeBand)
    && (!subject || pack.subject === subject)
  ));
  if (!localDate) return packs;
  return packs.map((pack) => ({
    ...pack,
    items: selectKidsDailyItems(pack.items, {
      count: Math.min(pack.items.length, Number(pack.dailyQuestionCount) || 5),
      localDate,
      scope: `regular:${pack.id}`,
    }),
  }));
}

export function normalizeKidsPack(pack, fallbackIndex = 0) {
  const source = pack && typeof pack === "object" ? pack : {};
  const gameTypeAliases = {
    "match-pairs": "matching",
    match: "matching",
    sort: "sorting",
    "word-scramble": "scramble",
    choice: "mcq",
  };
  const requestedGameType = gameTypeAliases[source.gameType] || source.gameType;
  const gameType = KIDS_GAME_TYPES[requestedGameType] ? requestedGameType : "mcq";
  return {
    ...source,
    id: String(source.id || source._id || `kids-pack-${fallbackIndex + 1}`),
    title: String(source.title || `Learning game ${fallbackIndex + 1}`),
    description: String(source.description || "A quick learning adventure."),
    gradeBand: String(source.gradeBand || "class1-2"),
    subject: String(source.subject || "English"),
    gameType,
    topic: String(source.topic || "Practice"),
    difficulty: String(source.difficulty || "easy"),
    estimatedMinutes: Math.max(1, Math.min(15, Number(source.estimatedMinutes) || 4)),
    items: Array.isArray(source.items)
      ? source.items.filter(Boolean).map((entry, itemIndex) => ({
        ...entry,
        id: String(entry.id || entry._id || `${source.id || fallbackIndex}-item-${itemIndex + 1}`),
        prompt: String(entry.prompt || entry.question || entry.text || `Question ${itemIndex + 1}`),
      }))
      : [],
    source: source.source || "server",
  };
}

function normalizedScalar(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function normalizedObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.keys(value).sort().reduce((result, key) => {
    result[normalizedScalar(key)] = normalizedScalar(value[key]);
    return result;
  }, {});
}

export function isKidsResponseCorrect(answer, response) {
  if (Array.isArray(answer)) {
    return Array.isArray(response)
      && answer.length === response.length
      && answer.every((value, index) => normalizedScalar(value) === normalizedScalar(response[index]));
  }
  if (answer && typeof answer === "object") {
    const expected = normalizedObject(answer);
    const actual = normalizedObject(response);
    if (!actual || Object.keys(expected).length !== Object.keys(actual).length) return false;
    return Object.entries(expected).every(([key, value]) => actual[key] === value);
  }
  return normalizedScalar(answer) === normalizedScalar(response);
}

export function evaluateLocalKidsAttempt(pack, responses = {}) {
  const items = Array.isArray(pack?.items) ? pack.items : [];
  const evaluations = items.map((entry) => {
    const response = responses[entry.id];
    let earnedPoints = 0;
    let possiblePoints = 1;
    if (Array.isArray(entry.answer)) {
      possiblePoints = entry.answer.length;
      earnedPoints = entry.answer.reduce(
        (sum, value, index) => sum + (
          normalizedScalar(value) === normalizedScalar(Array.isArray(response) ? response[index] : undefined) ? 1 : 0
        ),
        0,
      );
    } else if (entry.answer && typeof entry.answer === "object") {
      const expected = normalizedObject(entry.answer) || {};
      const actual = normalizedObject(response) || {};
      const expectedEntries = Object.entries(expected);
      possiblePoints = expectedEntries.length;
      earnedPoints = expectedEntries.reduce(
        (sum, [key, value]) => sum + (actual[key] === value ? 1 : 0),
        0,
      );
    } else {
      earnedPoints = isKidsResponseCorrect(entry.answer, response) ? 1 : 0;
    }
    const correct = possiblePoints > 0 && earnedPoints === possiblePoints;
    return { itemId: entry.id, response, correct, earnedPoints, possiblePoints };
  });
  const correctCount = evaluations.filter(({ correct }) => correct).length;
  const earnedPoints = evaluations.reduce((sum, evaluation) => sum + evaluation.earnedPoints, 0);
  const possiblePoints = evaluations.reduce((sum, evaluation) => sum + evaluation.possiblePoints, 0);
  return {
    packId: pack?.id,
    subject: pack?.subject,
    total: items.length,
    correct: correctCount,
    evaluations,
    earnedPoints,
    possiblePoints,
    percentage: possiblePoints ? Math.round((earnedPoints / possiblePoints) * 100) : 0,
  };
}

export function createDefaultKidsProgress() {
  return {
    stars: 0,
    coins: 0,
    streak: 0,
    dailyStreak: 0,
    lastDailyDate: "",
    lastActiveDate: "",
    attempts: [],
    mastery: {},
    retryQueue: [],
    badges: [],
    completedDailyMissions: [],
    serverStars: 0,
    serverCoins: 0,
    offlineStars: 0,
    offlineCoins: 0,
    serverMastery: {},
    offlineMastery: {},
  };
}

export function createDefaultParentSettings(language = "en") {
  return {
    parentPinConfigured: false,
    timeLimitMinutes: 20,
    audioEnabled: true,
    timerVisible: true,
    language: language === "hi" ? "hi" : "en",
  };
}

export function calculateKidsDailyStreak(completedDates = [], todayValue = new Date()) {
  const dates = new Set((Array.isArray(completedDates) ? completedDates : [])
    .map((date) => String(date || "").trim())
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date)));
  if (!dates.size) return 0;
  const today = localDateKey(todayValue);
  let cursor = new Date(`${today}T12:00:00.000Z`);
  if (!dates.has(today)) cursor = new Date(cursor.getTime() - 86_400_000);
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10)) && streak < 366) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return streak;
}

export function applyKidsAttempt(progressValue, attempt, options = {}) {
  const progress = { ...createDefaultKidsProgress(), ...(progressValue || {}) };
  const total = Math.max(0, Number(attempt?.total) || 0);
  const correct = Math.max(0, Math.min(total, Number(attempt?.correct) || 0));
  const today = String(options.today || new Date().toISOString().slice(0, 10));
  const subject = String(attempt?.subject || "General");
  const offlineMasteryBase = progressValue?.offlineMastery
    || (progressValue?.serverMastery ? {} : progress.mastery)
    || {};
  const serverMasteryBase = progressValue?.serverMastery || {};
  const previousOfflineMastery = offlineMasteryBase[subject] || { correct: 0, total: 0 };
  const nextOfflineMastery = {
    correct: (Number(previousOfflineMastery.correct) || 0) + correct,
    total: (Number(previousOfflineMastery.total) || 0) + total,
  };
  nextOfflineMastery.percentage = nextOfflineMastery.total
    ? Math.round(nextOfflineMastery.correct / nextOfflineMastery.total * 100)
    : 0;
  const serverSubjectMastery = serverMasteryBase[subject] || { correct: 0, total: 0 };
  const masteryTotal = (Number(serverSubjectMastery.total) || 0) + nextOfflineMastery.total;
  const masteryCorrect = (Number(serverSubjectMastery.correct) || 0) + nextOfflineMastery.correct;
  const masteryPercentage = masteryTotal ? Math.round((masteryCorrect / masteryTotal) * 100) : 0;
  const retryByKey = new Map((progress.retryQueue || []).map((entry) => [`${entry.packId}:${entry.itemId}`, entry]));
  (attempt?.evaluations || []).forEach((evaluation) => {
    const key = `${attempt.packId}:${evaluation.itemId}`;
    if (evaluation.correct) retryByKey.delete(key);
    else retryByKey.set(key, {
      packId: attempt.packId,
      itemId: evaluation.itemId,
      subject,
      addedAt: today,
    });
  });
  const badgeId = `mastery-${subject.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const shouldAwardBadge = masteryTotal >= 5 && masteryPercentage >= 80;
  const badges = shouldAwardBadge
    ? [...new Set([...(progress.badges || []), badgeId])]
    : [...(progress.badges || [])];
  const baseStars = correct * 2;
  const completionStars = total > 0 ? 1 : 0;
  const earnedStars = baseStars + completionStars;
  const coins = correct * 5 + (total > 0 ? 5 : 0) + (options.isDailyMission ? 10 : 0) + (options.isBossRound ? 15 : 0);
  const previousOfflineStars = Math.max(0, Number(progress.offlineStars) || 0);
  const previousOfflineCoins = Math.max(0, Number(progress.offlineCoins) || 0);
  const serverStars = Number.isFinite(Number(progressValue?.serverStars))
    ? Math.max(0, Number(progressValue.serverStars))
    : Math.max(0, (Number(progress.stars) || 0) - previousOfflineStars);
  const serverCoins = Number.isFinite(Number(progressValue?.serverCoins))
    ? Math.max(0, Number(progressValue.serverCoins))
    : Math.max(0, (Number(progress.coins) || 0) - previousOfflineCoins);
  const offlineStars = previousOfflineStars + earnedStars;
  const offlineCoins = previousOfflineCoins + coins;
  const completedDailyMissions = options.isDailyMission
    ? [...new Set([...(progress.completedDailyMissions || []), today])]
    : [...(progress.completedDailyMissions || [])];
  const dailyStreak = calculateKidsDailyStreak(completedDailyMissions, today);
  const savedAttempt = {
    id: String(attempt?.id || `${attempt?.packId || "kids"}-${Date.now()}`),
    packId: String(attempt?.packId || ""),
    subject,
    correct,
    total,
    percentage: total ? Math.round((correct / total) * 100) : 0,
    completedAt: options.completedAt || new Date().toISOString(),
    mode: options.isDailyMission ? "daily" : options.isBossRound ? "boss" : options.isRetry ? "retry" : "game",
    starsEarned: earnedStars,
    coinsEarned: coins,
  };
  const offlineMastery = {
    ...offlineMasteryBase,
    [subject]: nextOfflineMastery,
  };
  return {
    ...progress,
    stars: serverStars + offlineStars,
    coins: serverCoins + offlineCoins,
    serverStars,
    serverCoins,
    offlineStars,
    offlineCoins,
    streak: dailyStreak,
    dailyStreak,
    lastActiveDate: today,
    lastDailyDate: options.isDailyMission ? today : progress.lastDailyDate || "",
    attempts: [savedAttempt, ...(progress.attempts || [])].slice(0, 100),
    mastery: {
      ...(progress.mastery || {}),
      [subject]: { correct: masteryCorrect, total: masteryTotal, percentage: masteryPercentage },
    },
    serverMastery: serverMasteryBase,
    offlineMastery,
    retryQueue: [...retryByKey.values()].slice(0, 50),
    badges,
    completedDailyMissions,
    lastReward: {
      stars: earnedStars,
      coins,
      badgeAwarded: shouldAwardBadge && !(progress.badges || []).includes(badgeId) ? badgeId : "",
    },
  };
}

function combineKidsMastery(serverMastery = {}, offlineMastery = {}) {
  const combined = {};
  const subjects = new Set([...Object.keys(serverMastery || {}), ...Object.keys(offlineMastery || {})]);
  subjects.forEach((subject) => {
    const serverEntry = serverMastery?.[subject] || {};
    const offlineEntry = offlineMastery?.[subject] || {};
    const correct = (Number(serverEntry.correct) || 0) + (Number(offlineEntry.correct) || 0);
    const total = (Number(serverEntry.total) || 0) + (Number(offlineEntry.total) || 0);
    combined[subject] = {
      correct,
      total,
      percentage: total ? Math.round(correct / total * 100) : 0,
    };
  });
  return combined;
}

export function mergeKidsProgress(localValue, serverValue) {
  const local = { ...createDefaultKidsProgress(), ...(localValue || {}) };
  const server = serverValue && typeof serverValue === "object" ? serverValue : {};
  const localAttempts = Array.isArray(local.attempts) ? local.attempts : [];
  const serverAttempts = Array.isArray(server.attempts) ? server.attempts : [];
  const seenAttempts = new Set();
  const attempts = [...serverAttempts, ...localAttempts].filter((attempt) => {
    const key = String(attempt?.id || `${attempt?.packId}:${attempt?.completedAt}`);
    if (seenAttempts.has(key)) return false;
    seenAttempts.add(key);
    return true;
  }).slice(0, 100);
  const offlineMastery = localValue?.offlineMastery
    || (localValue?.serverMastery ? {} : local.mastery)
    || {};
  const serverMastery = server.mastery && typeof server.mastery === "object"
    ? server.mastery
    : local.serverMastery || {};
  const mastery = combineKidsMastery(serverMastery, offlineMastery);
  const offlineStars = Math.max(0, Number(local.offlineStars) || 0);
  const offlineCoins = Math.max(0, Number(local.offlineCoins) || 0);
  const previousServerStars = Number.isFinite(Number(localValue?.serverStars))
    ? Math.max(0, Number(localValue.serverStars))
    : Math.max(0, (Number(local.stars) || 0) - offlineStars);
  const previousServerCoins = Number.isFinite(Number(localValue?.serverCoins))
    ? Math.max(0, Number(localValue.serverCoins))
    : Math.max(0, (Number(local.coins) || 0) - offlineCoins);
  const serverStars = Math.max(previousServerStars, Number(server.stars) || 0);
  const serverCoins = Math.max(previousServerCoins, Number(server.coins) || 0);
  const retryItems = new Map();
  const offlineOnlyRetries = (local.retryQueue || []).filter((entry) => entry?.addedAt);
  [...offlineOnlyRetries, ...(server.retryQueue || [])].forEach((entry) => {
    if (!entry) return;
    const key = `${entry.packId || ""}:${entry.itemId || entry.id || ""}`;
    if (key !== ":") retryItems.set(key, entry);
  });
  const completedDailyMissions = [...new Set([
    ...(local.completedDailyMissions || []),
    ...(server.completedDailyMissions || []),
  ])];
  const dailyStreak = calculateKidsDailyStreak(completedDailyMissions);
  return {
    ...local,
    ...server,
    stars: serverStars + offlineStars,
    coins: serverCoins + offlineCoins,
    serverStars,
    serverCoins,
    offlineStars,
    offlineCoins,
    streak: dailyStreak,
    dailyStreak,
    lastDailyDate: [...completedDailyMissions].sort().at(-1) || "",
    mastery,
    serverMastery,
    offlineMastery,
    retryQueue: [...retryItems.values()].slice(0, 50),
    badges: [...new Set([...(local.badges || []), ...(server.badges || [])])],
    attempts,
    completedDailyMissions,
  };
}

export function buildLocalDailyMission(gradeBand, progress = createDefaultKidsProgress(), localDate = new Date()) {
  const subjectIds = SUBJECTS_BY_AGE_BAND[gradeBand] || SUBJECTS_BY_AGE_BAND["class1-2"];
  const retryKeys = new Set((progress.retryQueue || []).map((entry) => `${entry.packId}:${entry.itemId}`));
  const date = localDateKey(localDate);
  const allCandidates = getFallbackKidsPacks(gradeBand)
    .flatMap((pack) => pack.items.map((entry) => ({ pack, entry })));
  const candidates = getFallbackKidsPacks(gradeBand, null, date)
    .flatMap((pack) => pack.items.map((entry) => ({ pack, entry })));
  const dailyCandidates = selectKidsDailyItems(candidates, {
    count: candidates.length,
    localDate: date,
    scope: `daily:${gradeBand}`,
  });
  const selected = [];
  selectKidsDailyItems(
    allCandidates.filter(({ pack, entry }) => retryKeys.has(`${pack.id}:${entry.id}`)),
    { count: 2, localDate: date, scope: `daily-retry:${gradeBand}` },
  ).forEach((candidate) => selected.push(candidate));
  subjectIds.forEach((subject) => {
    if (selected.length >= 5) return;
    const candidate = dailyCandidates.find(({ pack, entry }) => (
      pack.subject === subject && !selected.some((selectedItem) => selectedItem.entry.id === entry.id)
    ));
    if (candidate) selected.push(candidate);
  });
  dailyCandidates.forEach((candidate) => {
    if (selected.length >= 5) return;
    if (!selected.some((selectedItem) => selectedItem.entry.id === candidate.entry.id)) selected.push(candidate);
  });
  const items = selected.slice(0, 5).map(({ pack, entry }) => ({
    ...entry,
    originalGameType: pack.gameType,
  }));
  return {
    id: `daily-${gradeBand}-${date}`,
    gradeBand,
    subject: "Mixed",
    gameType: "mcq",
    title: "Today’s Power Mission",
    titleHi: "आज का पावर मिशन",
    description: "Five friendly questions from across your learning worlds.",
    descriptionHi: "आपकी सीखने की दुनिया से पाँच मज़ेदार सवाल।",
    topic: "Daily review",
    difficulty: "adaptive",
    estimatedMinutes: 5,
    items,
    source: "local",
    mixedGameTypes: true,
  };
}

export function buildLocalRetryPack(gradeBand, progress = createDefaultKidsProgress()) {
  const retryKeys = new Set((progress.retryQueue || []).map((entry) => `${entry.packId}:${entry.itemId}`));
  const items = [];
  getFallbackKidsPacks(gradeBand).forEach((pack) => {
    pack.items.forEach((entry) => {
      if (retryKeys.has(`${pack.id}:${entry.id}`)) {
        items.push({ ...entry, originalPackId: pack.id, originalGameType: pack.gameType });
      }
    });
  });
  if (!items.length) return null;
  return {
    id: `retry-${gradeBand}`,
    gradeBand,
    subject: "Mixed",
    gameType: "mcq",
    title: "Brave Retry Trail",
    titleHi: "बहादुर दोबारा प्रयास",
    description: "Meet tricky questions again with a fresh start.",
    descriptionHi: "कठिन सवालों को नई शुरुआत के साथ फिर करो।",
    topic: "Mistake practice",
    difficulty: "adaptive",
    estimatedMinutes: Math.min(10, Math.max(2, items.length * 2)),
    items: items.slice(0, 5),
    source: "local",
    mixedGameTypes: true,
  };
}

export function buildLocalBossPack(gradeBand, subject, localDate = new Date()) {
  const bank = BOSS_KIDS_QUESTION_BANKS[`${gradeBand}:${subject}`] || [];
  const items = selectKidsDailyItems(bank, {
    count: 7,
    localDate,
    scope: `boss:${gradeBand}:${subject}`,
  }).map((entry) => ({ ...entry, originalGameType: "mcq" }));
  if (!items.length) return null;
  const subjectInfo = KIDS_SUBJECTS[subject] || KIDS_SUBJECTS.English;
  return {
    id: `boss-${gradeBand}-${subject.toLocaleLowerCase()}`,
    gradeBand,
    subject,
    gameType: "mcq",
    title: `${subjectInfo.name} Boss Round`,
    titleHi: `${subjectInfo.nameHi} बॉस राउंड`,
    description: "Seven challenge questions. Effort unlocks the victory chest!",
    descriptionHi: "पाँच छोटे सवाल। मेहनत से जीत का खज़ाना खुलेगा!",
    topic: "Subject challenge",
    difficulty: "challenge",
    estimatedMinutes: 5,
    items,
    source: "local",
    mixedGameTypes: true,
  };
}

export function buildKidsResponseSnapshot(responses, itemId, draft) {
  if (!itemId) return { ...(responses || {}) };
  return { ...(responses || {}), [itemId]: draft };
}

export function isValidParentPin(pin) {
  return /^\d{4}$/.test(String(pin || ""));
}

export function getKidsStorageKey(userProfile = {}) {
  const identifier = String(userProfile?.id || userProfile?._id || userProfile?.email || "local");
  let hash = 0;
  for (let index = 0; index < identifier.length; index += 1) hash = Math.imul(31, hash) + identifier.charCodeAt(index) | 0;
  return `${KIDS_STORAGE_PREFIX}:${Math.abs(hash).toString(36)}`;
}

export function loadKidsLocalState(storage, key) {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || "null");
    if (!parsed || parsed.version !== KIDS_STORAGE_VERSION) return null;
    const savedSettings = parsed.settings && typeof parsed.settings === "object"
      ? parsed.settings
      : {};
    return {
      progress: mergeKidsProgress(createDefaultKidsProgress(), parsed.progress),
      settings: {
        parentPinConfigured: Boolean(savedSettings.parentPinConfigured),
        timeLimitMinutes: Math.max(10, Math.min(60, Number(savedSettings.timeLimitMinutes) || 20)),
        audioEnabled: savedSettings.audioEnabled !== false,
        timerVisible: savedSettings.timerVisible !== false,
        language: savedSettings.language === "hi" ? "hi" : "en",
      },
      selectedAgeBand: KIDS_AGE_BANDS.some(({ id }) => id === parsed.selectedAgeBand)
        ? parsed.selectedAgeBand
        : "",
    };
  } catch {
    return null;
  }
}

export function saveKidsLocalState(storage, key, value) {
  try {
    storage?.setItem(key, JSON.stringify({
      version: KIDS_STORAGE_VERSION,
      progress: value.progress,
      settings: {
        parentPinConfigured: Boolean(value.settings?.parentPinConfigured),
        timeLimitMinutes: Math.max(10, Math.min(60, Number(value.settings?.timeLimitMinutes) || 20)),
        audioEnabled: value.settings?.audioEnabled !== false,
        timerVisible: value.settings?.timerVisible !== false,
        language: value.settings?.language === "hi" ? "hi" : "en",
      },
      selectedAgeBand: value.selectedAgeBand,
    }));
    return true;
  } catch {
    return false;
  }
}

export function formatSessionRemaining(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export const KIDS_API_ENDPOINTS = Object.freeze({
  profile: "GET /api/kids/profile",
  packs: "GET /api/kids/packs?gradeBand=&subject=&gameType=",
  dailyMission: "GET /api/kids/daily-mission?gradeBand=&subject=",
  submitAttempt: "POST /api/kids/attempts",
  parentSettings: "GET, PUT /api/kids/parent-settings",
});
