import { useEffect } from "react";
import { MessageCircle, Mic, ShieldCheck, Sparkles } from "lucide-react";
import "./KidsAiChatPage.css";

function openKidsAiChat() {
  window.dispatchEvent(new CustomEvent("openPrepMatrixAIChat"));
}

export default function KidsAiChatPage() {
  useEffect(() => {
    const timer = window.setTimeout(openKidsAiChat, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section className="page-stack kids-ai-chat-page">
      <section aria-labelledby="kids-ai-chat-title" className="card kids-ai-chat-hero">
        <span aria-hidden="true" className="kids-ai-chat-orb">
          <MessageCircle size={34} strokeWidth={2.1} />
        </span>
        <div className="kids-ai-chat-copy">
          <span className="section-tag"><Sparkles size={14} /> Learning helper</span>
          <h2 id="kids-ai-chat-title">Kids AI Chat</h2>
          <p>
            Ask a short question about school or something you are learning.
            Answers are kept simple and age-appropriate.
          </p>
          <button className="kids-ai-chat-open" onClick={openKidsAiChat} type="button">
            <MessageCircle aria-hidden="true" size={18} />
            Open Kids AI Chat
          </button>
        </div>
      </section>

      <div className="kids-ai-chat-guidance" aria-label="Kids AI Chat guidance">
        <article className="card">
          <ShieldCheck aria-hidden="true" size={22} />
          <div>
            <strong>Keep personal details private</strong>
            <p>Do not share your address, phone number, passwords, photos, or secrets.</p>
          </div>
        </article>
        <article className="card">
          <Mic aria-hidden="true" size={22} />
          <div>
            <strong>You can ask with your voice</strong>
            <p>Use the microphone or Wake Assistant for a learning question.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
