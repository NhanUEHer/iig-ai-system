// One key per user-initiated mutation. Network retries of the same call must reuse it;
// a new click is a new operation and gets a new key.
export function idempotencyConfig(config = {}) {
  const key = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return { ...config, headers: { ...(config.headers || {}), 'Idempotency-Key': key } };
}
