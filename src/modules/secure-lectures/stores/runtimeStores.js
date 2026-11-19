const redis = require('../../../config/redis');
const { createDbSessionStore } = require('./sessionStore.db');
const { createRedisSessionStore } = require('./sessionStore.redis');
const { createMemoryTicketStore, createRedisTicketStore } = require('./ticketStore');
const { createMemoryRateLimitStore, createRedisRateLimitStore } = require('./rateLimitStore');

const sessionStore = redis.configured()
  ? createRedisSessionStore({ redis })
  : createDbSessionStore();
const ticketStore = redis.configured()
  ? createRedisTicketStore({ redis })
  : createMemoryTicketStore();
const rateLimitStore = redis.configured()
  ? createRedisRateLimitStore({ redis })
  : createMemoryRateLimitStore();

module.exports = { sessionStore, ticketStore, rateLimitStore };
