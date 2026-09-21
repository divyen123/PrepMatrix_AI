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

export async function retireLegacySessionExpiry(collection) {
  const indexes = await collection.listIndexes().toArray();
  const expiryIndexes = indexes.filter((index) => (
    index?.key?.expiresAt === 1
    && typeof index.expireAfterSeconds === "number"
  ));

  for (const index of expiryIndexes) {
    try {
      await collection.dropIndex(index.name);
    } catch (error) {
      // Another server may have removed the same index during deployment.
      if (error?.code !== 27 && error?.codeName !== "IndexNotFound") throw error;
    }
  }

  return collection.updateMany(
    { expiresAt: { $exists: true } },
    { $unset: { expiresAt: "" } },
  );
}
