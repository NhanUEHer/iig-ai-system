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

function createMemoryRateLimitStore(options) {
  return new MemoryRateLimitStore(options);
}

module.exports = { RateLimitStore, MemoryRateLimitStore, createMemoryRateLimitStore };
