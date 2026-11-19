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

function createMemoryTicketStore(options) {
  return new MemoryTicketStore(options);
}

module.exports = { TicketStore, MemoryTicketStore, createMemoryTicketStore };
