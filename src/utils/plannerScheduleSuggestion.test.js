import assert from 'node:assert/strict';
import test from 'node:test';
import { getScheduleCompletion } from './plannerLifecycle.js';
import { claimPlannerScheduleSuggestion } from './plannerScheduleSuggestion.js';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('suggests a new plan once per finished schedule and academic profile', () => {
  const saved = storage();
  const schedule = [{ day: 1, date: '2026-09-30', momentumToken: 'plan-a', tasks: [{ id: 'study-1', task: 'Study Java' }] }];
  const pending = getScheduleCompletion(schedule, []);
  const finished = getScheduleCompletion(schedule, ['Study Java']);

  assert.equal(claimPlannerScheduleSuggestion(saved, 'profile-a', schedule, pending), false);
  assert.equal(claimPlannerScheduleSuggestion(saved, 'profile-a', schedule, finished), true);
  assert.equal(claimPlannerScheduleSuggestion(saved, 'profile-a', schedule, finished), false);
  assert.equal(claimPlannerScheduleSuggestion(saved, 'profile-b', schedule, finished), true);
  assert.equal(claimPlannerScheduleSuggestion(saved, 'profile-a', [{ ...schedule[0], momentumToken: 'plan-b' }], finished), true);
});

test('still avoids repeating the suggestion when browser storage is unavailable', () => {
  const unavailable = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const schedule = [{ day: 1, momentumToken: 'private-plan', tasks: [{ task: 'Revise SQL' }] }];
  const finished = getScheduleCompletion(schedule, ['Revise SQL']);
  assert.equal(claimPlannerScheduleSuggestion(unavailable, 'private-profile', schedule, finished), true);
  assert.equal(claimPlannerScheduleSuggestion(unavailable, 'private-profile', schedule, finished), false);
});
