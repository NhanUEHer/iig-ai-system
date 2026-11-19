class TicketStore {
  async put() { throw new Error('TicketStore.put is not implemented.'); }
  async consume() { throw new Error('TicketStore.consume is not implemented.'); }
  async delete() { throw new Error('TicketStore.delete is not implemented.'); }
}

class MemoryTicketStore extends TicketStore {
  constructor({ now = Date.now } = {}) {
    super();
    this.now = now;
    this.tickets = new Map();
  }

  async put(ticket, value, ttlSec) {
    this.tickets.set(ticket, {
      value: { ...value },
      expiresAt: this.now() + ttlSec * 1000,
    });
    return { ...value };
  }

  async consume(ticket) {
    const entry = this.tickets.get(ticket);
    this.tickets.delete(ticket);
    if (!entry || entry.expiresAt <= this.now()) return null;
    return { ...entry.value };
  }

  async delete(ticket) {
    return this.tickets.delete(ticket);
  }
}

class RedisTicketStore extends TicketStore {
  constructor({ redis }) {
    super();
    this.redis = redis;
    this.kind = 'redis';
  }

  key(ticket) { return `sl:ticket:${ticket}`; }

  async client() {
    const client = await this.redis.connection();
    if (!client) throw new Error('Redis ticket store is unavailable.');
    return client;
  }

  async put(ticket, value, ttlSec) {
    await (await this.client()).set(this.key(ticket), JSON.stringify(value), { EX: ttlSec });
    return { ...value };
  }

  async consume(ticket) {
    const raw = await (await this.client()).getDel(this.key(ticket));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async delete(ticket) { return (await this.client()).del(this.key(ticket)); }
}

function createMemoryTicketStore(options) {
  return new MemoryTicketStore(options);
}

function createRedisTicketStore(options) { return new RedisTicketStore(options); }

module.exports = {
  TicketStore,
  MemoryTicketStore,
  RedisTicketStore,
  createMemoryTicketStore,
  createRedisTicketStore,
};
