export const AUTH_RECOVERY_RETRY_DELAY_MS = 1_200;
export const AUTH_RECOVERY_RETRY_TIMEOUT_MS = 20_000;

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function recoverAuthSession(loadSession, options = {}) {
  const wait = options.wait || delay;
  const retryDelayMs = options.retryDelayMs ?? AUTH_RECOVERY_RETRY_DELAY_MS;
  const retryTimeoutMs = options.retryTimeoutMs ?? AUTH_RECOVERY_RETRY_TIMEOUT_MS;

  try {
    return await loadSession();
  } catch (error) {
    // Authentication failures are authoritative. Retries are reserved for a
    // sleeping backend, a timeout, or another temporary server/network error.
    if (error?.status === 401) throw error;
    await wait(retryDelayMs);
    return loadSession({ timeoutMs: retryTimeoutMs });
  }
}
