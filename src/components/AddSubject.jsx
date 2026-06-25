import { useState } from "react";

function AddSubject({ subjects, setSubjects }) {
  const [name, setName] = useState("");
  const [chapters, setChapters] = useState("");
  const [difficulty, setDifficulty] = useState("medium");

  const addSubject = () => {
    if (!name.trim() || !chapters) {
      return;
    }

    setSubjects([
      ...subjects,
      {
        name: name.trim(),
        chapters: Number(chapters),
        difficulty,
      },
    ]);

    setName("");
    setChapters("");
    setDifficulty("medium");
  };

  return (
    <section className="card">
      <h2>Add subject</h2>
      <p className="card-subtext">
        Build the subject list the timetable generator will balance across your
        available study days.
      </p>

      <div className="form-grid">
        <input
          onChange={(event) => setName(event.target.value)}
          placeholder="Subject name"
          value={name}
        />

        <input
          min="1"
          onChange={(event) => setChapters(event.target.value)}
          placeholder="Total chapters"
          type="number"
          value={chapters}
        />
      </div>

      <div className="input-row">
        <select
          className="difficulty-select"
          onChange={(event) => setDifficulty(event.target.value)}
          value={difficulty}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        <button className="action-btn" onClick={addSubject} type="button">
          Add subject
        </button>
      </div>
    </section>
  );
}

export default AddSubject;
