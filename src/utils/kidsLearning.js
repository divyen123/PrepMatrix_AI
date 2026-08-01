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
    bossCopy: "Five quick questions to win a subject badge.",
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
    safetyCopy: "Rewards celebrate effort and improvement. There are no public ranks, ads, purchases or open-ended chat in Kids Mode.",
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
    bossCopy: "विषय बैज जीतने के लिए पाँच छोटे सवाल।",
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
    safetyCopy: "इनाम मेहनत और सुधार के लिए हैं। किड्स मोड में सार्वजनिक रैंक, विज्ञापन, खरीदारी या खुली चैट नहीं है।",
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

export const FALLBACK_KIDS_PACKS = [
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

export function getFallbackKidsPacks(gradeBand, subject) {
  return FALLBACK_KIDS_PACKS.filter((pack) => (
    (!gradeBand || pack.gradeBand === gradeBand)
    && (!subject || pack.subject === subject)
  ));
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
    pinHash: "",
    timeLimitMinutes: 20,
    audioEnabled: true,
    timerVisible: true,
    language: language === "hi" ? "hi" : "en",
  };
}

function dayDifference(previousDate, nextDate) {
  if (!previousDate || !nextDate) return null;
  const previous = Date.parse(`${previousDate}T00:00:00Z`);
  const next = Date.parse(`${nextDate}T00:00:00Z`);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return null;
  return Math.round((next - previous) / 86_400_000);
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
  const difference = dayDifference(progress.lastActiveDate, today);
  const streak = progress.lastActiveDate === today
    ? progress.streak
    : difference === 1 ? Math.max(1, progress.streak + 1) : 1;
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
    streak,
    lastActiveDate: today,
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
  return {
    ...local,
    ...server,
    stars: serverStars + offlineStars,
    coins: serverCoins + offlineCoins,
    serverStars,
    serverCoins,
    offlineStars,
    offlineCoins,
    streak: Math.max(Number(local.streak) || 0, Number(server.streak) || 0),
    mastery,
    serverMastery,
    offlineMastery,
    retryQueue: [...retryItems.values()].slice(0, 50),
    badges: [...new Set([...(local.badges || []), ...(server.badges || [])])],
    attempts,
    completedDailyMissions: [...new Set([
      ...(local.completedDailyMissions || []),
      ...(server.completedDailyMissions || []),
    ])],
  };
}

export function buildLocalDailyMission(gradeBand, progress = createDefaultKidsProgress()) {
  const subjectIds = SUBJECTS_BY_AGE_BAND[gradeBand] || SUBJECTS_BY_AGE_BAND["class1-2"];
  const retryKeys = new Set((progress.retryQueue || []).map((entry) => `${entry.packId}:${entry.itemId}`));
  const candidates = getFallbackKidsPacks(gradeBand).flatMap((pack) => pack.items.map((entry) => ({ pack, entry })));
  const selected = [];
  candidates.filter(({ pack, entry }) => retryKeys.has(`${pack.id}:${entry.id}`)).slice(0, 2).forEach((candidate) => selected.push(candidate));
  subjectIds.forEach((subject) => {
    if (selected.length >= 5) return;
    const candidate = candidates.find(({ pack, entry }) => (
      pack.subject === subject && !selected.some((selectedItem) => selectedItem.entry.id === entry.id)
    ));
    if (candidate) selected.push(candidate);
  });
  candidates.forEach((candidate) => {
    if (selected.length >= 5) return;
    if (!selected.some((selectedItem) => selectedItem.entry.id === candidate.entry.id)) selected.push(candidate);
  });
  const items = selected.slice(0, 5).map(({ pack, entry }) => ({
    ...entry,
    originalGameType: pack.gameType,
  }));
  return {
    id: `daily-${gradeBand}`,
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

export function buildLocalBossPack(gradeBand, subject) {
  const packs = getFallbackKidsPacks(gradeBand, subject);
  const items = packs.flatMap((pack) => pack.items.map((entry) => ({
    ...entry,
    originalGameType: pack.gameType,
  })));
  if (!items.length) return null;
  const subjectInfo = KIDS_SUBJECTS[subject] || KIDS_SUBJECTS.English;
  return {
    id: `boss-${gradeBand}-${subject.toLocaleLowerCase()}`,
    gradeBand,
    subject,
    gameType: "mcq",
    title: `${subjectInfo.name} Boss Round`,
    titleHi: `${subjectInfo.nameHi} बॉस राउंड`,
    description: "Five quick challenges. Effort unlocks the victory chest!",
    descriptionHi: "पाँच छोटे सवाल। मेहनत से जीत का खज़ाना खुलेगा!",
    topic: "Subject challenge",
    difficulty: "mixed",
    estimatedMinutes: 5,
    items: items.slice(0, 5),
    source: "local",
    mixedGameTypes: true,
  };
}

export function hashParentPin(pin) {
  const value = `prepmatrix-parent:${String(pin || "")}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function isValidParentPin(pin) {
  return /^\d{4}$/.test(String(pin || ""));
}

export function verifyParentPin(pin, hash) {
  return Boolean(hash) && isValidParentPin(pin) && hashParentPin(pin) === hash;
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
    return {
      progress: mergeKidsProgress(createDefaultKidsProgress(), parsed.progress),
      settings: { ...createDefaultParentSettings(), ...(parsed.settings || {}) },
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
      settings: value.settings,
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
