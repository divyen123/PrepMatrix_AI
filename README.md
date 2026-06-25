# PrepMatrix AI

PrepMatrix AI is a modern, premium, and feature-rich study planning and cognitive learning companion. It integrates state-of-the-art AI assistance, dynamic task rebalancing, hands-free voice operations, and deep study telemetry to help students organize academic tracks, assess progress, and unlock their highest potential.

Live Frontend: [https://prep-matrix-ai.vercel.app](https://prep-matrix-ai.vercel.app)  
Live Backend: [https://prepmatrix-ai.onrender.com](https://prepmatrix-ai.onrender.com)

---

## 🚀 Key Features

*   📅 **Smart Planner & Scheduler:** Automatically distributes study workloads, balances daily tasks based on difficulty, and offers active recovery strategies for missed milestones.
*   🤖 **AI Study Assistant:** Interactive study chatbot tailored to your academic level. Clarifies doubts, outlines topics, and retrieves planner metrics directly in conversation.
*   📊 **Telemetry & Analytics:** Visualizes task completion progress, daily task distribution, exam readiness projections, and weekly study velocity signals.
*   🎙️ **Voice-Command Assistant:** Hands-free voice controls. Use "Hey Jarvis" to ask about your study status, log completions, or get voice status checks.
*   🏆 **Interactive Quizzes:** Generates custom topic-level quizzes powered by AI, keeping track of scores and difficulty progressions.
*   📝 **Interactive Study Notes:** Save chapter summaries, document custom doubts, and keep track of left-over topics per subject.
*   📚 **Curated Study Materials:** Suggests chapter-wise online reference articles, videos, and lets you bookmark your favorite resource links.
*   📄 **PDF Report Generation:** Generates detailed PDF intelligence reports highlighting task completion metrics, subject breakdowns, and productivity trends.

---

## 🛠️ Technology Stack

*   **Frontend:** React (Vite), React Router, Lucide Icons, CSS3 (Glassmorphism & animations)
*   **Backend:** Node.js, Express 5 (wildcard routing support)
*   **Database:** MongoDB Atlas (Cloud) & MongoDB Native Node.js Driver
*   **AI Models (via Groq Cloud):**
    *   **Chat/Quiz Generation:** `llama-3.3-70b-versatile`
    *   **Voice Transcription:** `whisper-large-v3-turbo`

---

## 📦 Getting Started (Local Development)

### Prerequisites
*   Node.js (v18 or higher)
*   MongoDB installed locally or a MongoDB Atlas connection string
*   Groq API Key (from [console.groq.com](https://console.groq.com/keys))

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/divyen123/PrepMatrix_AI.git
    cd PrepMatrix_AI
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure environment variables:**
    Create a `.env` file in the root directory (refer to `.env.example`):
    ```env
    # Server configuration
    PORT=8787
    NODE_ENV=development

    # MongoDB configurations
    MONGODB_URI=mongodb://127.0.0.1:27017
    MONGODB_DB=prepmatrix

    # AI Configurations (Groq API)
    GROQ_API_KEY=your-groq-api-key-here
    GROQ_CHAT_MODEL=llama-3.3-70b-versatile
    GROQ_TRANSCRIPTION_MODEL=whisper-large-v3-turbo

    # CORS configuration
    FRONTEND_URL=http://localhost:5173
    ```

4.  **Run the application:**
    To start both the Express backend and the Vite dev server concurrently:
    ```bash
    npm run dev
    ```
    *   Frontend dev server: `http://localhost:5173`
    *   Backend API server: `http://localhost:8787`

---

## 📄 License

This project is licensed under the MIT License. Developed for Divyen R M.
