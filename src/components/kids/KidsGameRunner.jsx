import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Eraser,
  Lightbulb,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import {
  KIDS_GAME_TYPES,
  buildKidsResponseSnapshot,
  getKidsCopy,
  getLocalized,
  isKidsResponseCorrect,
} from "../../utils/kidsLearning";
import KidsPetTutor from "./KidsPetTutor";

const GAME_TYPE_ALIASES = {
  "match-pairs": "matching",
  match: "matching",
  sort: "sorting",
  "word-scramble": "scramble",
  choice: "mcq",
};

function normalizedGameType(value) {
  const type = GAME_TYPE_ALIASES[value] || value;
  return KIDS_GAME_TYPES[type] ? type : "mcq";
}

function inferGameType(item, pack) {
  if (!pack?.mixedGameTypes) return normalizedGameType(pack?.gameType);
  if (item?.originalGameType) return normalizedGameType(item.originalGameType);
  if (item?.leftItems || item?.rightItems) return "matching";
  if (item?.sortableItems || item?.sortItems || item?.categories) return "sorting";
  if (item?.sequenceItems || item?.steps) return "sequence";
  if (item?.scrambled || item?.tiles) return "scramble";
  if (item?.count || item?.tapItems || item?.targetCount) return "count-tap";
  if (item?.audioPrompt || item?.audioText) return "listen-pick";
  if (item?.emoji || item?.visual) return "picture-choice";
  return "mcq";
}

function entryValue(entry) {
  return String(entry && typeof entry === "object" ? entry.id || entry.value || entry.label : entry ?? "");
}

function entryLabel(entry) {
  return String(entry && typeof entry === "object" ? entry.label || entry.text || entry.value || entry.id : entry ?? "");
}

function entryVisual(entry) {
  return String(entry && typeof entry === "object" ? entry.visual || entry.emoji || "" : "");
}

function getInitialDraft(item, gameType) {
  if (gameType === "matching") {
    const leftItems = item?.leftItems || [];
    return Object.fromEntries(leftItems.map((entry) => [entryValue(entry), ""]));
  }
  if (gameType === "sorting") {
    const sortItems = item?.sortableItems || item?.sortItems || [];
    return Object.fromEntries(sortItems.map((entry) => [entryValue(entry), ""]));
  }
  if (gameType === "sequence") {
    return (item?.sequenceItems || item?.steps || []).map(entryValue);
  }
  if (gameType === "count-tap" && Array.isArray(item?.tapItems)) return [];
  return "";
}

function responseIsReady(item, gameType, response) {
  if (gameType === "matching") {
    const leftItems = item?.leftItems || [];
    return leftItems.length > 0 && leftItems.every((entry) => Boolean(response?.[entryValue(entry)]));
  }
  if (gameType === "sorting") {
    const sortItems = item?.sortableItems || item?.sortItems || [];
    return sortItems.length > 0 && sortItems.every((entry) => Boolean(response?.[entryValue(entry)]));
  }
  if (gameType === "sequence") return Array.isArray(response) && response.length > 0;
  if (gameType === "count-tap" && Array.isArray(item?.tapItems)) {
    return Array.isArray(response) && response.length === Number(item.targetCount || 0);
  }
  return String(response ?? "").trim().length > 0;
}

function optionCards(options, draft, setDraft, disabled) {
  return (
    <div className="kids-answer-grid">
      {(options || []).map((option) => {
        const value = entryValue(option);
        const selected = draft === value;
        return (
          <button
            aria-pressed={selected}
            className={`kids-answer-option${selected ? " is-selected" : ""}`}
            disabled={disabled}
            key={value}
            onClick={() => setDraft(value)}
            type="button"
          >
            {entryVisual(option) && <span aria-hidden="true">{entryVisual(option)}</span>}
            <strong>{entryLabel(option)}</strong>
          </button>
        );
      })}
    </div>
  );
}

export default function KidsGameRunner({
  pack,
  language = "en",
  audioEnabled = true,
  onExit,
  onComplete,
  submitting = false,
}) {
  const copy = getKidsCopy(language);
  const [itemIndex, setItemIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [hintVisible, setHintVisible] = useState(false);
  const startedAtRef = useRef(0);
  const items = Array.isArray(pack?.items) ? pack.items : [];
  const currentItem = items[itemIndex];
  const gameType = useMemo(() => inferGameType(currentItem, pack), [currentItem, pack]);
  const gameInfo = KIDS_GAME_TYPES[gameType] || KIDS_GAME_TYPES.mcq;
  const prompt = language === "hi" ? currentItem?.promptHi || currentItem?.prompt : currentItem?.prompt;
  const hasLocalAnswer = Object.prototype.hasOwnProperty.call(currentItem || {}, "answer");
  const isLast = itemIndex >= items.length - 1;
  const ready = responseIsReady(currentItem, gameType, draft);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [pack?.id]);

  useEffect(() => {
    setDraft(getInitialDraft(currentItem, gameType));
    setFeedback(null);
    setHintVisible(false);
  }, [currentItem, gameType]);

  if (!currentItem) {
    return (
      <section className="kids-game-shell kids-game-empty" role="status">
        <span aria-hidden="true">🧰</span>
        <h2>This game pack is being restocked.</h2>
        <button onClick={onExit} type="button">{copy.backToMap}</button>
      </section>
    );
  }

  const saveCurrentResponse = () => {
    if (!ready || feedback) return;
    const nextResponses = buildKidsResponseSnapshot(responses, currentItem.id, draft);
    setResponses(nextResponses);
    if (hasLocalAnswer) {
      const correct = isKidsResponseCorrect(currentItem.answer, draft);
      setFeedback({ status: correct ? "correct" : "incorrect", correct });
    } else {
      setFeedback({ status: "saved", correct: null });
    }
  };

  const moveToNext = () => {
    if (!feedback) return;
    if (isLast) {
      const finalResponses = buildKidsResponseSnapshot(responses, currentItem.id, draft);
      onComplete({
        responses: finalResponses,
        durationSeconds: Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
      });
      return;
    }
    setItemIndex((value) => value + 1);
  };

  const moveSequenceEntry = (index, direction) => {
    if (feedback) return;
    setDraft((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const renderInteraction = () => {
    if (["picture-choice", "listen-pick", "mcq"].includes(gameType)) {
      return optionCards(currentItem.options, draft, setDraft, Boolean(feedback));
    }

    if (gameType === "count-tap") {
      if (Array.isArray(currentItem.tapItems)) {
        return (
          <div className="kids-tap-board" aria-label={`Choose ${currentItem.targetCount} items`}>
            <p>Tap exactly <strong>{currentItem.targetCount}</strong>.</p>
            <div>
              {currentItem.tapItems.map((tapItem) => {
                const value = entryValue(tapItem);
                const selected = draft.includes(value);
                return (
                  <button
                    aria-pressed={selected}
                    className={selected ? "is-selected" : ""}
                    disabled={Boolean(feedback)}
                    key={value}
                    onClick={() => setDraft((current) => selected
                      ? current.filter((id) => id !== value)
                      : current.length < Number(currentItem.targetCount) ? [...current, value] : current)}
                    type="button"
                  >
                    <span aria-hidden="true">{entryVisual(tapItem) || "⭐"}</span>
                    <small>{entryLabel(tapItem)}</small>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }
      return (
        <>
          <div aria-label={`${currentItem.count} ${currentItem.countEmoji || "items"}`} className="kids-count-board">
            {Array.from({ length: Number(currentItem.count) || 0 }, (_, index) => (
              <span aria-hidden="true" key={`${currentItem.id}-count-${index}`}>{currentItem.countEmoji || "⭐"}</span>
            ))}
          </div>
          {optionCards(currentItem.options, draft, setDraft, Boolean(feedback))}
        </>
      );
    }

    if (gameType === "matching") {
      const rightItems = currentItem.rightItems || [];
      return (
        <div className="kids-pair-board">
          {(currentItem.leftItems || []).map((leftItem) => {
            const leftValue = entryValue(leftItem);
            return (
              <label className={draft[leftValue] ? "is-selected" : ""} key={leftValue}>
                <span>{entryVisual(leftItem)} {entryLabel(leftItem)}</span>
                <select
                  aria-label={`${copy.selectFor} ${entryLabel(leftItem)}`}
                  disabled={Boolean(feedback)}
                  onChange={(event) => setDraft((current) => ({ ...current, [leftValue]: event.target.value }))}
                  value={draft[leftValue] || ""}
                >
                  <option value="">Choose…</option>
                  {rightItems.map((rightItem) => (
                    <option key={entryValue(rightItem)} value={entryValue(rightItem)}>
                      {entryVisual(rightItem)} {entryLabel(rightItem)}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      );
    }

    if (gameType === "sorting") {
      const sortItems = currentItem.sortableItems || currentItem.sortItems || [];
      const categories = currentItem.categories || [];
      return (
        <div className="kids-sort-board">
          {sortItems.map((sortItem) => {
            const value = entryValue(sortItem);
            return (
              <fieldset key={value}>
                <legend>{entryVisual(sortItem)} {entryLabel(sortItem)}</legend>
                <div>
                  {categories.map((category) => {
                    const categoryValue = entryValue(category);
                    return (
                      <button
                        aria-pressed={draft[value] === categoryValue}
                        className={draft[value] === categoryValue ? "is-selected" : ""}
                        disabled={Boolean(feedback)}
                        key={categoryValue}
                        onClick={() => setDraft((current) => ({ ...current, [value]: categoryValue }))}
                        type="button"
                      >
                        {entryVisual(category)} {entryLabel(category)}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      );
    }

    if (gameType === "sequence") {
      const labelByValue = new Map((currentItem.steps || currentItem.sequenceItems || []).map((entry) => [entryValue(entry), entryLabel(entry)]));
      return (
        <ol className="kids-sequence-board">
          {draft.map((value, index) => (
            <li key={`${value}-${index}`}>
              <span aria-hidden="true">{index + 1}</span>
              <strong>{labelByValue.get(value) || value}</strong>
              <div>
                <button aria-label={`${copy.moveUp}: ${labelByValue.get(value) || value}`} disabled={Boolean(feedback) || index === 0} onClick={() => moveSequenceEntry(index, -1)} type="button">
                  <ArrowUp aria-hidden="true" size={17} />
                </button>
                <button aria-label={`${copy.moveDown}: ${labelByValue.get(value) || value}`} disabled={Boolean(feedback) || index === draft.length - 1} onClick={() => moveSequenceEntry(index, 1)} type="button">
                  <ArrowDown aria-hidden="true" size={17} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      );
    }

    if (gameType === "scramble") {
      const tiles = Array.isArray(currentItem.tiles)
        ? currentItem.tiles
        : String(currentItem.scrambled || "").split("");
      const normalizedDraft = String(draft || "").toLocaleUpperCase();
      return (
        <div className="kids-scramble-board">
          <div aria-label="Letter tiles" className="kids-letter-tiles">
            {tiles.map((tile, index) => {
              const normalizedTile = String(tile).toLocaleUpperCase();
              const occurrence = tiles.slice(0, index + 1)
                .filter((candidate) => String(candidate).toLocaleUpperCase() === normalizedTile).length;
              const selected = [...normalizedDraft].filter((candidate) => candidate === normalizedTile).length >= occurrence;
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? "is-selected" : ""}
                  disabled={Boolean(feedback) || selected}
                  key={`${tile}-${index}`}
                  onClick={() => setDraft((current) => `${current}${tile}`)}
                  type="button"
                >
                  {tile}
                </button>
              );
            })}
          </div>
          <label>
            <span>{copy.typeAnswer}</span>
            <div>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                disabled={Boolean(feedback)}
                onChange={(event) => setDraft(event.target.value)}
                value={draft}
              />
              <button aria-label="Clear answer" disabled={Boolean(feedback) || !draft} onClick={() => setDraft("")} type="button">
                <Eraser aria-hidden="true" size={18} />
              </button>
            </div>
          </label>
        </div>
      );
    }

    return optionCards(currentItem.options, draft, setDraft, Boolean(feedback));
  };

  const feedbackMessage = feedback?.status === "correct"
    ? copy.correct
    : feedback?.status === "incorrect" ? copy.incorrect : copy.saved;
  const petGameLabel = language === "hi" ? gameInfo.labelHi : gameInfo.label;
  const petMessage = `${petGameLabel} · ${copy.question} ${itemIndex + 1}/${items.length}`;

  return (
    <section className="kids-game-shell" aria-labelledby="kids-game-title">
      <header className="kids-game-header">
        <button className="kids-game-back" onClick={onExit} type="button">
          <ArrowLeft aria-hidden="true" size={18} />
          <span>{copy.backToMap}</span>
        </button>
        <div className="kids-game-title">
          <span aria-hidden="true">{gameInfo.icon}</span>
          <div>
            <small>{language === "hi" ? gameInfo.labelHi : gameInfo.label}</small>
            <h1 id="kids-game-title">{getLocalized(pack, language, "title")}</h1>
          </div>
        </div>
        <span className="kids-game-counter">{itemIndex + 1} / {items.length}</span>
      </header>

      <div aria-label={`${copy.progress}: ${itemIndex + 1} of ${items.length}`} className="kids-game-progress" role="progressbar" aria-valuemax={items.length} aria-valuemin="0" aria-valuenow={itemIndex + 1}>
        <span style={{ width: `${((itemIndex + 1) / Math.max(1, items.length)) * 100}%` }} />
      </div>

      <div className="kids-game-stage">
        <KidsPetTutor
          audioEnabled={audioEnabled}
          autoSpeakKey={`${pack.id}:${currentItem.id}`}
          language={language}
          message={petMessage}
          speechMessage={currentItem.audioText || currentItem.audioPrompt || prompt}
          state={feedback?.correct ? "celebrate" : feedback?.status === "incorrect" ? "encourage" : "idle"}
        />

        <article className={`kids-question-card is-${gameType}`}>
          <div className="kids-question-meta">
            <span>{copy.question} {itemIndex + 1}</span>
            <span>{gameInfo.icon} {language === "hi" ? gameInfo.labelHi : gameInfo.label}</span>
          </div>
          {currentItem.visual && <div aria-hidden="true" className="kids-question-visual">{currentItem.visual}</div>}
          {currentItem.emoji && <div aria-hidden="true" className="kids-question-visual">{currentItem.emoji}</div>}
          <h2>{prompt}</h2>

          {gameType === "listen-pick" && (
            <button className="kids-listen-cue" disabled={!audioEnabled} onClick={() => {
              if (!audioEnabled || !("speechSynthesis" in window)) return;
              window.speechSynthesis.cancel();
              const utterance = new SpeechSynthesisUtterance(currentItem.audioText || currentItem.audioPrompt || prompt);
              utterance.lang = language === "hi" ? "hi-IN" : "en-IN";
              utterance.rate = 0.86;
              window.speechSynthesis.speak(utterance);
            }} type="button">
              <Volume2 aria-hidden="true" size={20} />
              {audioEnabled ? copy.readToMe : `${copy.readToMe} (off)`}
            </button>
          )}

          {renderInteraction()}

          {(currentItem.hint || currentItem.explanation) && !feedback && (
            <div className="kids-hint-area">
              <button aria-expanded={hintVisible} onClick={() => setHintVisible((value) => !value)} type="button">
                <Lightbulb aria-hidden="true" size={17} />
                {copy.hint}
              </button>
              {hintVisible && <p>{currentItem.hint || currentItem.explanation}</p>}
            </div>
          )}

          {feedback && (
            <div aria-live="assertive" className={`kids-answer-feedback is-${feedback.status}`} role="status">
              <span aria-hidden="true">
                {feedback.status === "correct" ? <Check size={24} /> : feedback.status === "incorrect" ? <RotateCcw size={22} /> : <Sparkles size={22} />}
              </span>
              <div>
                <strong>{feedbackMessage}</strong>
                {feedback.status === "incorrect" && currentItem.explanation && <p>{currentItem.explanation}</p>}
              </div>
            </div>
          )}

          <div className="kids-question-actions">
            {!feedback ? (
              <button className="kids-primary-action" disabled={!ready} onClick={saveCurrentResponse} type="button">
                <Check aria-hidden="true" size={19} />
                {copy.check}
              </button>
            ) : (
              <button className="kids-primary-action" disabled={submitting} onClick={moveToNext} type="button">
                {submitting && isLast ? <LoaderCircle aria-hidden="true" className="kids-spin" size={19} /> : isLast ? <Sparkles aria-hidden="true" size={19} /> : null}
                {isLast ? copy.finish : copy.next}
              </button>
            )}
            <button className="kids-quiet-action" onClick={onExit} type="button">
              <X aria-hidden="true" size={17} />
              {copy.backToMap}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}
