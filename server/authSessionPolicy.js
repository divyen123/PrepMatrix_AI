// The browser cookie is a finite fallback; the saved bearer token restores the
// durable server session and renews this cookie whenever the app is reopened.
export const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function createPersistentSessionDocument({ token, userId, now = new Date() }) {
  return {
    token,
    userId,
    createdAt: now,
    lastSeenAt: now,
  };
}

export function persistentSessionFilter(token) {
  return { token };
}

export function persistentSessionTouch(now = new Date()) {
  return {
    $set: { lastSeenAt: now },
    // Sessions created by older releases had a seven/thirty-day TTL. Remove it
    // as soon as that saved login is seen so only logout or security revocation
    // ends the session.
    $unset: { expiresAt: "" },
  };
}
