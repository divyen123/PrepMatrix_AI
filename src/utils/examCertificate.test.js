import assert from "node:assert/strict";
import test from "node:test";
import {
  formatExamPercentage,
  getExamCertificate,
  getExamCertificateId,
  getExamPercentage,
} from "./examCertificate.js";

const tierAt = (percentage) => getExamCertificate(percentage)?.key || null;

test("certificate tiers honor every score boundary", () => {
  assert.equal(tierAt(59.99), null);
  assert.equal(tierAt(60), "bronze");
  assert.equal(tierAt(74.99), "bronze");
  assert.equal(tierAt(75), "silver");
  assert.equal(tierAt(87.99), "silver");
  assert.equal(tierAt(88), "gold");
  assert.equal(tierAt(96), "gold");
  assert.equal(tierAt(96.01), "elite");
  assert.equal(tierAt(100), "elite");
});

test("released percentage is preferred and locked results never qualify", () => {
  assert.equal(getExamCertificate({ percentage: 88, score: 24, total: 40 })?.key, "gold");
  assert.equal(getExamCertificate({ percentage: 98, locked: true }), null);
  assert.equal(getExamCertificate({ percentage: 98, available: false }), null);
  assert.equal(getExamCertificate({}), null);
});

test("percentage falls back to score and total", () => {
  assert.equal(getExamPercentage({ score: 24, total: 40 }), 60);
  assert.equal(getExamCertificate({ score: 24, total: 40 })?.key, "bronze");
  assert.equal(formatExamPercentage({ score: 35, total: 40 }), "87.5");
});

test("certificate identifiers are deterministic", () => {
  assert.equal(
    getExamCertificateId({ attemptId: "abc123456789", submittedAt: "2026-07-12T10:30:00.000Z" }),
    "PMA-20260712-23456789",
  );
});
