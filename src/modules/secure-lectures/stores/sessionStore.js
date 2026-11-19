class SessionStore {
  async acquire() { throw new Error('SessionStore.acquire is not implemented.'); }
  async get() { throw new Error('SessionStore.get is not implemented.'); }
  async heartbeat() { throw new Error('SessionStore.heartbeat is not implemented.'); }
  async kick() { throw new Error('SessionStore.kick is not implemented.'); }
  async end() { throw new Error('SessionStore.end is not implemented.'); }
  async endAllForShare() { throw new Error('SessionStore.endAllForShare is not implemented.'); }
  async endAllForDevice() { throw new Error('SessionStore.endAllForDevice is not implemented.'); }
  async listLive() { throw new Error('SessionStore.listLive is not implemented.'); }
}

class MemorySessionStore extends SessionStore {
  constructor({ now = Date.now } = {}) {
    super();
    this.now = now;
    this.sessions = new Map();
    this.kind = 'memory';
  }

  purgeExpired(nowMs = this.now(), shareId = null) {
    for (const entry of this.sessions.values()) {
      if (entry.status === 'active' && entry.expiresAt < nowMs
        && (!shareId || entry.shareId === shareId)) entry.status = 'timeout';
    }
  }

  async acquire(session, maxConcurrent, nowMs, ttlSec) {
    this.purgeExpired(nowMs, session.shareId);
    const replaced = [];
    for (const entry of this.sessions.values()) {
      if (entry.shareId === session.shareId && entry.deviceRef === session.deviceRef
        && entry.status === 'active') {
        entry.status = 'replaced';
        replaced.push(entry.id);
      }
    }
    const live = await this.listLive(session.shareId, nowMs);
    if (live.length >= maxConcurrent) return { acquired: false, liveSessions: live, replaced };
    this.sessions.set(session.id, {
      ...session, status: 'active', kickedBy: null, expiresAt: nowMs + ttlSec * 1000,
    });
    return { acquired: true, session: { ...this.sessions.get(session.id) }, replaced };
  }

  async get(id) {
    this.purgeExpired();
    const entry = this.sessions.get(id);
    return entry && !['timeout', 'replaced'].includes(entry.status) ? { ...entry } : null;
  }

  async heartbeat(id, nowMs, ttlSec) {
    this.purgeExpired(nowMs);
    const entry = this.sessions.get(id);
    if (!entry || entry.status !== 'active') return entry ? { ...entry } : null;
    entry.lastHeartbeatAt = new Date(nowMs).toISOString();
    entry.expiresAt = nowMs + ttlSec * 1000;
    return { ...entry };
  }

  async kick(id, kickedBy = null) {
    const entry = this.sessions.get(id);
    if (!entry || entry.status !== 'active') return false;
    entry.status = 'kicked';
    entry.kickedBy = kickedBy;
    return true;
  }

  async end(id, reason = 'closed') {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    if (entry.status === 'active') entry.status = reason;
    return true;
  }

  async listLive(shareId, nowMs = this.now()) {
    this.purgeExpired(nowMs, shareId);
    return [...this.sessions.values()]
      .filter(entry => entry.shareId === shareId && entry.status === 'active')
      .map(entry => ({ ...entry }));
  }

  async endAllForShare(shareId, reason = 'closed') {
    let ended = 0;
    for (const entry of this.sessions.values()) {
      if (entry.shareId === shareId && entry.status === 'active') {
        entry.status = reason;
        ended += 1;
      }
    }
    return ended;
  }

  async endAllForDevice(deviceRef, reason = 'device_removed') {
    let ended = 0;
    for (const entry of this.sessions.values()) {
      if (entry.deviceRef === deviceRef && entry.status === 'active') {
        entry.status = reason;
        ended += 1;
      }
    }
    return ended;
  }

  async put(id, value, ttlSec) {
    this.sessions.set(id, {
      id, ...value, status: value.status || 'active', expiresAt: this.now() + ttlSec * 1000,
    });
    return { ...this.sessions.get(id) };
  }
  async touch(id, ttlSec, patch = {}) {
    const entry = this.sessions.get(id);
    if (!entry) return null;
    Object.assign(entry, patch, { expiresAt: this.now() + ttlSec * 1000 });
    return { ...entry };
  }
  async delete(id) { return this.sessions.delete(id); }
  async listByShare(shareId) { return this.listLive(shareId); }
}

function createMemorySessionStore(options) { return new MemorySessionStore(options); }

module.exports = { SessionStore, MemorySessionStore, createMemorySessionStore };
