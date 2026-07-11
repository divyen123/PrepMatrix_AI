import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, BookOpen, PenTool, Sparkles, Target, CheckCircle2 } from "lucide-react";

function SubjectProgressModal({ subject, onClose, schedule = [], completed = [] }) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // match transition duration
  };

  // Compute stats
  const subjectTasks = (schedule || []).flatMap((day) => {
    return (day.tasks || [])
      .filter((task) => task.task.startsWith(`${subject} -`))
      .map((task) => ({
        id: task.task,
        topic: task.task.replace(`${subject} - `, ""),
        date: day.date || new Date().toISOString(),
      }));
  });
  const totalChapters = subjectTasks.length;
  
  const completedChapters = subjectTasks
    .filter((task) => (completed || []).includes(task.id))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
    
  const completionPercentage = totalChapters === 0 ? 0 : Math.round((completedChapters.length / totalChapters) * 100);

  // Button actions
  const handleReferMaterial = () => {
    handleClose();
    navigate(`/?tab=materials&subject=${encodeURIComponent(subject)}`);
  };

  const handleQuiz = () => {
    handleClose();
    navigate(`/quiz?subject=${encodeURIComponent(subject)}`);
  };

  const handleAskAI = () => {
    handleClose();
    window.dispatchEvent(
      new CustomEvent("openPrepMatrixAIChat", {
        detail: {
          createNewChat: true,
          message: `I am currently studying ${subject} and have completed ${completionPercentage}% of the chapters. Can you help me review the following topics: `,
        },
      })
    );
  };

  return (
    <div className={`subject-modal-overlay ${isVisible ? "open" : ""}`} onClick={handleClose}>
      <div 
        className={`subject-modal-content card ${isVisible ? "open" : ""}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <button className="subject-modal-close" onClick={handleClose}>
          <X size={16} />
        </button>

        <div className="subject-modal-header">
          <h2 className="subject-modal-title">{subject} Progress</h2>
        </div>

        <div className="subject-modal-grid">
          {/* Timeline Section */}
          <div className="subject-timeline-section">
            <h3 className="section-title">Timeline of Completed Chapters</h3>
            {completedChapters.length > 0 ? (
              <div className="compact-timeline">
                {completedChapters.map((chapter, idx) => (
                  <div key={chapter.id} className="compact-timeline-item">
                    <div className="compact-timeline-marker">
                      <CheckCircle2 size={14} className="marker-icon" />
                      {idx < completedChapters.length - 1 && <div className="marker-line" />}
                    </div>
                    <div className="compact-timeline-content">
                      <p className="chapter-title">{chapter.topic}</p>
                      <span className="chapter-date">
                        {new Date(chapter.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-timeline">
                <p>No chapters completed yet. Time to get started!</p>
              </div>
            )}
          </div>

          {/* Readiness Section */}
          <div className="subject-readiness-section">
            <h3 className="section-title">Exam Readiness</h3>
            <div className="readiness-gauge">
              <div className="gauge-circle" style={{ "--progress": `${completionPercentage}%` }}>
                <div className="gauge-inner">
                  <Target size={24} className="gauge-icon" />
                  <span className="gauge-value">{completionPercentage}%</span>
                </div>
              </div>
              <p className="gauge-label">
                {completionPercentage === 100 
                  ? "Fully prepared!" 
                  : completionPercentage > 70 
                    ? "Almost there!" 
                    : completionPercentage > 40 
                      ? "Making good progress." 
                      : "Needs more attention."}
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="subject-modal-actions">
          <button className="compact-btn btn-outline" onClick={handleReferMaterial}>
            <BookOpen size={14} />
            <span>Refer Material</span>
          </button>
          <button className="compact-btn btn-outline" onClick={handleQuiz}>
            <PenTool size={14} />
            <span>Want a quiz?</span>
          </button>
          <button className="compact-btn btn-primary" onClick={handleAskAI}>
            <Sparkles size={14} />
            <span>Ask AI</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default SubjectProgressModal;
