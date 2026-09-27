import test from "node:test";
import assert from "node:assert/strict";
import {
  INITIAL_NEARBY_SEARCH, currentNearbySearch, nearbyRetrySeconds, nearbySearchKey, nearbySearchReducer,
} from "./nearbySearchState.js";

const origin = { lat: 13.1, lon: 80.2 };
const key = nearbySearchKey(origin, 20, "spots");
const places = [{ id: "library-1", name: "Local library" }];
const start = (state, requestId = 1, nextKey = key) => nearbySearchReducer(state, { type: "start", key: nextKey, requestId });
const succeed = (state, data = { places, notice: "Showing recently saved listings." }) => nearbySearchReducer(state, { type: "success", key: state.key, requestId: state.requestId, data });

test("retrying the same search retains successful listings and their freshness notice", () => {
  const loaded = succeed(start(INITIAL_NEARBY_SEARCH));
  const retry = start(loaded, 2);
  assert.equal(retry.loading, true);
  assert.equal(retry.hasResult, true);
  assert.deepEqual(retry.places, places);
  assert.equal(retry.notice, loaded.notice);
  const failed = nearbySearchReducer(retry, { type: "failure", key, requestId: 2, error: "Provider unavailable" });
  assert.equal(failed.loading, false);
  assert.equal(failed.hasResult, true);
  assert.deepEqual(failed.places, places);
  assert.equal(failed.notice, loaded.notice);
  assert.equal(failed.error, "Provider unavailable");
});

test("changing origin, radius or category immediately hides old data and starts fresh", () => {
  const loaded = succeed(start(INITIAL_NEARBY_SEARCH));
  const newKeys = [
    nearbySearchKey({ lat: 12, lon: 80.2 }, 20, "spots"),
    nearbySearchKey(origin, 5, "spots"),
    nearbySearchKey(origin, 20, "circles"),
  ];
  for (const nextKey of newKeys) {
    assert.deepEqual(currentNearbySearch(loaded, nextKey).places, []);
    const next = start(loaded, 2, nextKey);
    assert.deepEqual(next.places, []);
    assert.equal(next.hasResult, false);
    assert.equal(next.notice, "");
  }
});

test("outages remain distinct from successful empty results", () => {
  const loading = start(INITIAL_NEARBY_SEARCH);
  const failed = nearbySearchReducer(loading, { type: "failure", key, requestId: 1, error: "Timed out" });
  assert.equal(failed.hasResult, false);
  assert.equal(failed.error, "Timed out");
  const empty = succeed(start(failed, 2), { places: [] });
  assert.equal(empty.hasResult, true);
  assert.equal(empty.error, "");
  assert.deepEqual(empty.places, []);
});

test("late success and failure responses cannot overwrite a newer search or retry", () => {
  const newer = start(start(INITIAL_NEARBY_SEARCH), 2);
  for (const type of ["success", "failure"]) {
    assert.equal(nearbySearchReducer(newer, { type, key, requestId: 1, data: { places }, error: "Old outage" }), newer);
    assert.equal(nearbySearchReducer(newer, { type, key: "other-area", requestId: 2, data: { places }, error: "Old outage" }), newer);
  }
});

test("a completed refresh replaces the previous results and notice", () => {
  const loaded = succeed(start(INITIAL_NEARBY_SEARCH));
  const refreshed = succeed(start(loaded, 2), { places: [{ id: "new-library" }] });
  assert.deepEqual(refreshed.places, [{ id: "new-library" }]);
  assert.equal(refreshed.notice, "");
  assert.equal(refreshed.loading, false);
});

test("malformed successful responses preserve previous data and expose an error", () => {
  for (const data of [null, {}, { places: null }]) {
    const first = succeed(start(INITIAL_NEARBY_SEARCH), data);
    assert.equal(first.hasResult, false);
    assert.equal(first.loading, false);
    assert.match(first.error, /incomplete response/);
    const loaded = succeed(start(INITIAL_NEARBY_SEARCH));
    const failed = succeed(start(loaded, 2), data);
    assert.deepEqual(failed.places, loaded.places);
    assert.equal(failed.notice, loaded.notice);
    assert.equal(failed.hasResult, true);
    assert.match(failed.error, /incomplete response/);
  }
});

test("no place search is selected without a location or in revision circles", () => {
  assert.equal(nearbySearchKey(null, 5, "spots"), "");
  assert.equal(nearbySearchKey(origin, 5, "circles"), "");
  assert.equal(nearbySearchKey(origin, 5, "unsupported-category"), "");
});

test("provider retry delays count down to zero without changing results or starting a request", () => {
  const loaded = succeed(start(INITIAL_NEARBY_SEARCH));
  const retry = start(loaded, 2);
  const failed = nearbySearchReducer(retry, {
    type: "failure", key, requestId: 2, error: "Provider cooling down",
    retryAfterSeconds: 30, receivedAt: 1000,
  });
  assert.equal(failed.retryAt, 31000);
  assert.equal(nearbyRetrySeconds(failed.retryAt, 1000), 30);
  assert.equal(nearbyRetrySeconds(failed.retryAt, 2001), 29);
  assert.equal(nearbyRetrySeconds(failed.retryAt, 30999), 1);
  assert.equal(nearbyRetrySeconds(failed.retryAt, 31000), 0);
  assert.equal(nearbyRetrySeconds(failed.retryAt, 50000), 0);
  assert.equal(failed.loading, false);
  assert.deepEqual(failed.places, places);
});

test("degraded successful searches respect retry delays and a clean refresh clears them", () => {
  const loading = start(INITIAL_NEARBY_SEARCH);
  const degraded = nearbySearchReducer(loading, {
    type: "success", key, requestId: 1, receivedAt: 1000,
    data: { places, notice: "Showing saved listings.", retryAfterSeconds: 20 },
  });
  assert.equal(degraded.retryAt, 21000);
  assert.equal(degraded.hasResult, true);
  assert.equal(degraded.error, "");
  const recovered = succeed(start(degraded, 2), { places });
  assert.equal(recovered.retryAt, 0);
  assert.equal(nearbyRetrySeconds(recovered.retryAt, 1000), 0);
});

test("retry deadlines remain isolated to their query and ignore late responses", () => {
  const loading = start(INITIAL_NEARBY_SEARCH);
  const failed = nearbySearchReducer(loading, {
    type: "failure", key, requestId: 1, retryAfterSeconds: 30, receivedAt: 1000,
  });
  const nextKey = nearbySearchKey(origin, 5, "spots");
  assert.equal(currentNearbySearch(failed, nextKey).retryAt, 0);
  const changed = start(failed, 2, nextKey);
  assert.equal(changed.retryAt, 0);
  const late = nearbySearchReducer(changed, {
    type: "failure", key, requestId: 1, retryAfterSeconds: 60, receivedAt: 2000,
  });
  assert.equal(late, changed);
  assert.equal(nearbySearchReducer(failed, { type: "reset" }).retryAt, 0);
});

test("missing or invalid retry delays do not lock the retry button", () => {
  for (const retryAfterSeconds of [undefined, null, "30", -1, 0, Infinity, NaN]) {
    const failed = nearbySearchReducer(start(INITIAL_NEARBY_SEARCH), {
      type: "failure", key, requestId: 1, retryAfterSeconds, receivedAt: 1000,
    });
    assert.equal(failed.retryAt, 0);
    assert.equal(nearbyRetrySeconds(failed.retryAt, 1000), 0);
  }
});
