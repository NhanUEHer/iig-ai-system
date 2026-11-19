class RateLimitStore {
  async consume() { throw new Error('RateLimitStore.consume is not implemented.'); }
  async reset() { throw new Error('RateLimitStore.reset is not implemented.'); }
}

class MemoryRateLimitStore extends RateLimitStore {
  constructor({ now = Date.now } = {}) {
    super();
    this.now = now;
    this.buckets = new Map();
  }

  async consume(key, limit, windowSec) {
    const current = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= current) {
      bucket = { count: 0, resetAt: current + windowSec * 1000 };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - current) / 1000)),
    };
  }

  async reset(key) {
    return this.buckets.delete(key);
  }
}

const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`;

class RedisRateLimitStore extends RateLimitStore {
  constructor({ redis }) {
    super();
    this.redis = redis;
    this.kind = 'redis';
  }

  async client() {
    const client = await this.redis.connection();
    if (!client) throw new Error('Redis rate-limit store is unavailable.');
    return client;
  }

  async consume(key, limit, windowSec) {
    const result = await (await this.client()).eval(CONSUME_SCRIPT, {
      keys: [`sl:rate:${key}`], arguments: [String(windowSec)],
    });
    const count = Number(result[0]);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      retryAfterSec: Math.max(1, Number(result[1]) || windowSec),
    };
  }

  async reset(key) { return (await this.client()).del(`sl:rate:${key}`); }
}

function createMemoryRateLimitStore(options) {
  return new MemoryRateLimitStore(options);
}

function createRedisRateLimitStore(options) { return new RedisRateLimitStore(options); }

module.exports = {
  RateLimitStore,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  createMemoryRateLimitStore,
  createRedisRateLimitStore,
  CONSUME_SCRIPT,
};
