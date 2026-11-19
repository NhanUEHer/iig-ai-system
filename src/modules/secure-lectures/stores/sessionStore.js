class SessionStore {
  async put() { throw new Error('SessionStore.put is not implemented.'); }
  async get() { throw new Error('SessionStore.get is not implemented.'); }
  async touch() { throw new Error('SessionStore.touch is not implemented.'); }
  async delete() { throw new Error('SessionStore.delete is not implemented.'); }
  async listByShare() { throw new Error('SessionStore.listByShare is not implemented.'); }
}

class MemorySessionStore extends SessionStore {
  constructor({ now = Date.now } = {}) {
    super();
    this.now = now;
    this.sessions = new Map();
  }

  purgeExpired() {
    const current = this.now();
    for (const [id, entry] of this.sessions) {
      if (entry.expiresAt <= current) this.sessions.delete(id);
    }
  }

  async put(id, value, ttlSec) {
    this.sessions.set(id, {
      value: { ...value },
      expiresAt: this.now() + ttlSec * 1000,
    });
    return { ...value };
  }

  async get(id) {
    this.purgeExpired();
    const entry = this.sessions.get(id);
    return entry ? { ...entry.value } : null;
  }

  async touch(id, ttlSec, patch = {}) {
    this.purgeExpired();
    const entry = this.sessions.get(id);
    if (!entry) return null;
    entry.value = { ...entry.value, ...patch };
    entry.expiresAt = this.now() + ttlSec * 1000;
    return { ...entry.value };
  }

  async delete(id) {
    return this.sessions.delete(id);
  }

  async listByShare(shareId) {
    this.purgeExpired();
    return [...this.sessions.values()]
      .filter(entry => entry.value.shareId === shareId)
      .map(entry => ({ ...entry.value }));
  }
}

function createMemorySessionStore(options) {
  return new MemorySessionStore(options);
}

module.exports = { SessionStore, MemorySessionStore, createMemorySessionStore };
