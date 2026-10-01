import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onAcademicProfileBrowserDataCleared } from '../utils/academicProfileScope.js';
import {
  CODE_MATRIX_PRACTICE_QUESTIONS,
  CODE_MATRIX_PRACTICE_LANGUAGES,
  getCodeMatrixPracticeQuestion,
  isSuccessfulPracticeResult,
  normalizeCodeMatrixPracticeState,
  practiceResultMatchesDraft,
  readCodeMatrixPracticeState,
  writeCodeMatrixPracticeState,
} from '../utils/codeMatrixPractice.js';

export default function useCodeMatrixPractice(profileId, language) {
  const [snapshot, setSnapshot] = useState(() => ({
    profileId, state: readCodeMatrixPracticeState(profileId), panelOpen: false, storageAvailable: true,
  }));
  const latestRef = useRef(snapshot);
  const languageRef = useRef(language);
  // A changed profile gets a clean snapshot during render, before any effects
  // or callbacks can expose/save drafts belonging to the previous profile.
  let current = snapshot;
  if (snapshot.profileId !== profileId) {
    current = { profileId, state: readCodeMatrixPracticeState(profileId), panelOpen: false, storageAvailable: true };
    setSnapshot(current);
  }
  useLayoutEffect(() => {
    latestRef.current = current;
    languageRef.current = language;
  }, [current, language]);
  const mutate = useCallback((transform, persist = true) => {
    const existing = latestRef.current;
    if (existing.profileId !== profileId) return;
    const next = transform(existing);
    const normalized = { ...next, state: normalizeCodeMatrixPracticeState(next.state) };
    if (persist) normalized.storageAvailable = writeCodeMatrixPracticeState(profileId, normalized.state);
    latestRef.current = normalized;
    setSnapshot(normalized);
  }, [profileId]);

  useEffect(() => onAcademicProfileBrowserDataCleared((clearedId) => {
    if (clearedId !== profileId) return;
    mutate((value) => ({ ...value, state: readCodeMatrixPracticeState(''), panelOpen: false }), false);
  }), [mutate, profileId]);

  const openPanel = useCallback(() => mutate((value) => ({ ...value, panelOpen: true }), false), [mutate]);
  const closePanel = useCallback(() => mutate((value) => ({ ...value, panelOpen: false }), false), [mutate]);
  const showQuestions = useCallback(() => mutate((value) => ({
    ...value, panelOpen: true, state: { ...value.state, selectedQuestionId: '' },
  })), [mutate]);
  const selectQuestion = useCallback((id) => {
    const selected = getCodeMatrixPracticeQuestion(id);
    if (!selected) return false;
    mutate((value) => ({ ...value, panelOpen: true, state: {
      ...value.state, selectedQuestionId: selected.id,
      selectedLanguage: selected.supportedLanguages.includes(languageRef.current) ? languageRef.current : 'python',
    } }));
    return true;
  }, [mutate]);
  const setLanguage = useCallback((nextLanguage) => {
    const value = latestRef.current;
    if (!CODE_MATRIX_PRACTICE_LANGUAGES.includes(nextLanguage)
      || (!value.panelOpen && !value.state.selectedQuestionId)) return false;
    mutate((existing) => ({ ...existing, state: { ...existing.state, selectedLanguage: nextLanguage } }));
    return true;
  }, [mutate]);
  const exitPractice = useCallback(() => mutate((value) => ({
    ...value, panelOpen: false, state: { ...value.state, selectedQuestionId: '' },
  })), [mutate]);
  const updateDraft = useCallback((code) => {
    if (typeof code !== 'string') return;
    mutate((value) => {
      const selected = getCodeMatrixPracticeQuestion(value.state.selectedQuestionId);
      if (!selected?.supportedLanguages.includes(language)) return value;
      const key = `${selected.id}:v${selected.version}`;
      return { ...value, state: { ...value.state, drafts: { ...value.state.drafts,
        [key]: { ...value.state.drafts[key], [language]: code },
      } } };
    });
  }, [language, mutate]);
  const resetDraft = useCallback(() => {
    const selected = getCodeMatrixPracticeQuestion(latestRef.current.state.selectedQuestionId);
    if (selected?.supportedLanguages.includes(language)) updateDraft(selected.starters[language]);
  }, [language, updateDraft]);
  const markSolved = useCallback((result) => {
    const value = latestRef.current;
    if (value.profileId !== profileId || languageRef.current !== language) return false;
    const selected = getCodeMatrixPracticeQuestion(value.state.selectedQuestionId);
    if (!selected) return false;
    const key = `${selected.id}:v${selected.version}`;
    const code = value.state.drafts[key]?.[language] ?? selected.starters[language];
    if (!practiceResultMatchesDraft(result, selected, language, code)
      || !isSuccessfulPracticeResult(result, selected)) return false;
    mutate((existing) => ({ ...existing, state: {
      ...existing.state, solved: { ...existing.state.solved, [key]: true },
    } }));
    return true;
  }, [language, mutate, profileId]);

  const selected = getCodeMatrixPracticeQuestion(current.state.selectedQuestionId);
  const key = selected && `${selected.id}:v${selected.version}`;
  const draft = selected?.supportedLanguages.includes(language)
    ? current.state.drafts[key]?.[language] ?? selected.starters[language] : null;
  return {
    panelOpen: current.panelOpen, openPanel, closePanel, showQuestions,
    selectedQuestionId: selected?.id || '', question: selected, selectQuestion, exitPractice,
    selectedLanguage: current.state.selectedLanguage, setLanguage,
    draft, updateDraft, resetDraft, markSolved,
    solvedIds: CODE_MATRIX_PRACTICE_QUESTIONS.filter((item) => current.state.solved[`${item.id}:v${item.version}`]).map((item) => item.id),
    storageAvailable: current.storageAvailable,
  };
}
