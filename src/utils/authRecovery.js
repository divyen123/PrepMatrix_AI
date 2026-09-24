export const AUTH_RECOVERY_RETRY_DELAY_MS = 1_200;
export const AUTH_RECOVERY_RETRY_TIMEOUT_MS = 20_000;

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function recoverAuthSession(loadSession, options = {}) {
  const wait = options.wait || delay;
  const retryDelayMs = options.retryDelayMs ?? AUTH_RECOVERY_RETRY_DELAY_MS;
  const retryTimeoutMs = options.retryTimeoutMs ?? AUTH_RECOVERY_RETRY_TIMEOUT_MS;
  const retryUnauthorized = options.retryUnauthorized === true;

  try {
    return await loadSession();
  } catch (error) {
    // A remembered sign-in gets one more chance after a 401 in case startup
    // caught the backend between deployments or while it was waking up.
    // Password changes remain final because they revoke the saved credential.
    if (error?.status === 401 && (!retryUnauthorized || error?.code === "PASSWORD_CHANGED")) {
      throw error;
    }
    await wait(retryDelayMs);
    return loadSession({ timeoutMs: retryTimeoutMs });
  }
}
