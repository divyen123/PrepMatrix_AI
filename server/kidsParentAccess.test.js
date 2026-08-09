import test from "node:test";
import assert from "node:assert/strict";
import {
  KIDS_PARENT_ACCESS_TTL_MS,
  getYoungKidsAccessProfile,
  grantParentAccess,
  kidsWorkspaceScheduleChanged,
  parentAccessStatus,
  readParentAccess,
  revokeParentAccess,
} from "./kidsParentAccess.js";

test("planner access distinguishes schedule mutations from ordinary child progress saves", () => {
  const existing = {
    schedule: [{ day: "Day 1", tasks: [{ task: "Read a story", time: "10:00" }] }],
    scheduleStartDate: "2026-08-09",
  };

  assert.equal(kidsWorkspaceScheduleChanged(existing, {
    schedule: structuredClone(existing.schedule),
    completed: ["Read a story"],
  }), false);
  assert.equal(kidsWorkspaceScheduleChanged(existing, {
    schedule: [{ day: "Day 1", tasks: [{ task: "New maths plan", time: "10:00" }] }],
  }), true);
  assert.equal(kidsWorkspaceScheduleChanged(existing, {
    scheduleStartDate: "2026-08-10",
  }), true);
});

test("young Kids access is limited to early years and exact Classes 1 through 3", () => {
  const cases = [
    [{ academicLevel: "Early Years / Kindergarten", grade: "UKG" }, true, "early-years"],
    [{ academicLevel: "Primary School", grade: "Class 1" }, true, "class1-2"],
    [{ academicLevel: "School", grade: "Grade 2" }, true, "class1-2"],
    [{ academicLevel: "Primary School", grade: "Class 3" }, true, "class3-5"],
    [{ academicLevel: "Primary School", grade: "Class 4" }, false, null],
    [{ academicLevel: "Primary School", grade: "Class 5" }, false, null],
    [{ academicLevel: "Middle School", grade: "Class 6" }, false, null],
    [{ academicLevel: "Undergraduate / Bachelor's", degree: "B.Tech" }, false, null],
    [{ academicLevel: "Primary School" }, false, null],
  ];

  cases.forEach(([profile, eligible, gradeBand]) => {
    const access = getYoungKidsAccessProfile(profile);
    assert.equal(access.eligible, eligible, JSON.stringify(profile));
    assert.equal(access.gradeBand, gradeBand, JSON.stringify(profile));
  });
});

test("parent access status expires at the configured boundary without leaking session data", () => {
  const now = new Date("2026-08-09T10:00:00.000Z");
  assert.deepEqual(parentAccessStatus({}, { parentPinConfigured: false, now }), {
    unlocked: false,
    expiresAt: null,
    setupRequired: true,
  });
  assert.deepEqual(parentAccessStatus({
    parentAccessUntil: new Date(now.getTime() + 1),
  }, { parentPinConfigured: true, now }), {
    unlocked: true,
    expiresAt: "2026-08-09T10:00:00.001Z",
    setupRequired: false,
  });
  assert.deepEqual(parentAccessStatus({
    parentAccessUntil: now,
  }, { parentPinConfigured: true, now }), {
    unlocked: false,
    expiresAt: null,
    setupRequired: false,
  });
});

test("grant, read, and revoke store short-lived access on the authenticated session", async () => {
  const sessions = [{ token: "session-one", userId: "user-one" }];
  const db = {
    collection(name) {
      assert.equal(name, "sessions");
      return {
        async findOne(filter) {
          return sessions.find((session) => session.token === filter.token) || null;
        },
        async updateOne(filter, update) {
          const session = sessions.find((candidate) => candidate.token === filter.token);
          if (!session) return { matchedCount: 0 };
          Object.assign(session, update.$set || {});
          Object.keys(update.$unset || {}).forEach((key) => delete session[key]);
          return { matchedCount: 1 };
        },
      };
    },
  };
  const now = new Date("2026-08-09T10:00:00.000Z");

  const granted = await grantParentAccess(db, "session-one", {
    parentPinConfigured: true,
    now,
  });
  assert.deepEqual(granted, {
    unlocked: true,
    expiresAt: new Date(now.getTime() + KIDS_PARENT_ACCESS_TTL_MS).toISOString(),
    setupRequired: false,
  });
  assert.deepEqual(
    await readParentAccess(db, "session-one", {
      parentPinConfigured: true,
      now: new Date(now.getTime() + KIDS_PARENT_ACCESS_TTL_MS - 1),
    }),
    granted,
  );

  const revoked = await revokeParentAccess(db, "session-one", {
    parentPinConfigured: true,
    now,
  });
  assert.deepEqual(revoked, {
    unlocked: false,
    expiresAt: null,
    setupRequired: false,
  });
  assert.equal(sessions[0].parentAccessUntil, undefined);
  assert.equal(sessions[0].parentAccessGrantedAt, undefined);
});
