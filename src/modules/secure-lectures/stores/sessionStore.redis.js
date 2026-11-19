const redisConfig = require('../../../config/redis');
const { SessionStore } = require('./sessionStore');

const ACQUIRE_SCRIPT = `
local zkey = KEYS[1]
local prefix = ARGV[1]
local sessionId = ARGV[2]
local deviceRef = ARGV[3]
local nowMs = tonumber(ARGV[5])
local ttlMs = tonumber(ARGV[6])
local maxConcurrent = tonumber(ARGV[7])
local cutoff = nowMs - ttlMs
local stale = redis.call('ZRANGEBYSCORE', zkey, '-inf', '(' .. cutoff)
for _, id in ipairs(stale) do
  redis.call('ZREM', zkey, id)
  redis.call('HSET', prefix .. id, 'status', 'timeout')
  redis.call('PEXPIRE', prefix .. id, ttlMs)
end
local live = redis.call('ZRANGE', zkey, 0, -1)
local replaced = {}
for _, id in ipairs(live) do
  if redis.call('HGET', prefix .. id, 'deviceRef') == deviceRef then
    redis.call('ZREM', zkey, id)
    redis.call('HSET', prefix .. id, 'status', 'replaced')
    redis.call('PEXPIRE', prefix .. id, ttlMs)
    table.insert(replaced, id)
  end
end
live = redis.call('ZRANGE', zkey, 0, -1)
if #live >= maxConcurrent then
  return cjson.encode({ acquired = false, live = live, replaced = replaced })
end
local skey = prefix .. sessionId
redis.call('ZADD', zkey, nowMs, sessionId)
redis.call('HSET', skey,
  'id', sessionId, 'shareId', ARGV[9], 'deviceRef', deviceRef,
  'deviceId', ARGV[4], 'status', 'active', 'kickedBy', '',
  'startedAt', ARGV[8], 'lastHeartbeatAt', ARGV[8],
  'deviceLabel', ARGV[10])
redis.call('PEXPIRE', skey, ttlMs * 2)
redis.call('PEXPIRE', zkey, ttlMs * 2)
return cjson.encode({ acquired = true, live = {}, replaced = replaced })
`;

class RedisSessionStore extends SessionStore {
  constructor({ redis = redisConfig } = {}) {
    super();
    this.redis = redis;
    this.kind = 'redis';
  }

  zkey(shareId) { return `sl:share:${shareId}:sessions`; }
  skey(sessionId) { return `sl:session:${sessionId}`; }

  async client() {
    const client = await this.redis.connection();
    if (!client) throw new Error('Redis session store is unavailable.');
    return client;
  }

  async acquire(session, maxConcurrent, nowMs, ttlSec) {
    const client = await this.client();
    const raw = await client.eval(ACQUIRE_SCRIPT, {
      keys: [this.zkey(session.shareId)],
      arguments: [
        'sl:session:', session.id, session.deviceRef, session.deviceId,
        String(nowMs), String(ttlSec * 1000), String(maxConcurrent),
        session.startedAt, session.shareId, session.deviceLabel || '',
      ],
    });
    const result = JSON.parse(raw);
    if (!result.acquired) {
      return {
        acquired: false,
        liveSessions: await this.details(result.live || []),
        replaced: result.replaced || [],
      };
    }
    return { acquired: true, session, replaced: result.replaced || [] };
  }

  async details(ids) {
    if (!ids.length) return [];
    const client = await this.client();
    const rows = await Promise.all(ids.map(id => client.hGetAll(this.skey(id))));
    return rows.filter(row => row?.id).map(row => ({ ...row, kickedBy: row.kickedBy || null }));
  }

  async get(id) {
    const row = await (await this.client()).hGetAll(this.skey(id));
    return row?.id ? { ...row, kickedBy: row.kickedBy || null } : null;
  }

  async heartbeat(id, nowMs, ttlSec) {
    const client = await this.client();
    const row = await client.hGetAll(this.skey(id));
    if (!row?.id || row.status !== 'active') return row?.id ? row : null;
    const iso = new Date(nowMs).toISOString();
    await client.multi()
      .zAdd(this.zkey(row.shareId), [{ score: nowMs, value: id }])
      .hSet(this.skey(id), 'lastHeartbeatAt', iso)
      .pExpire(this.skey(id), ttlSec * 2000)
      .pExpire(this.zkey(row.shareId), ttlSec * 2000)
      .exec();
    return { ...row, lastHeartbeatAt: iso };
  }

  async kick(id, kickedBy = null) {
    const client = await this.client();
    const row = await client.hGetAll(this.skey(id));
    if (!row?.id || row.status !== 'active') return false;
    await client.multi().zRem(this.zkey(row.shareId), id)
      .hSet(this.skey(id), { status: 'kicked', kickedBy: kickedBy || '' }).exec();
    return true;
  }

  async end(id, reason = 'closed') {
    const client = await this.client();
    const row = await client.hGetAll(this.skey(id));
    if (!row?.id) return false;
    await client.multi().zRem(this.zkey(row.shareId), id)
      .hSet(this.skey(id), 'status', reason).exec();
    return true;
  }

  async listLive(shareId, nowMs = Date.now()) {
    const client = await this.client();
    const ids = await client.zRange(this.zkey(shareId), 0, -1);
    return this.details(ids);
  }

  async endMany(entries, reason) {
    if (!entries.length) return 0;
    const client = await this.client();
    const tx = client.multi();
    for (const entry of entries) {
      tx.zRem(this.zkey(entry.shareId), entry.id);
      tx.hSet(this.skey(entry.id), 'status', reason);
    }
    await tx.exec();
    return entries.length;
  }

  async endAllForShare(shareId, reason = 'closed') {
    const client = await this.client();
    const ids = await client.zRange(this.zkey(shareId), 0, -1);
    const entries = await this.details(ids);
    return this.endMany(entries, reason);
  }

  async endAllForDevice(deviceRef, reason = 'device_removed') {
    const client = await this.client();
    let cursor = 0;
    const entries = [];
    do {
      const page = await client.scan(cursor, { MATCH: 'sl:session:*', COUNT: 100 });
      cursor = page.cursor;
      const rows = await this.details(page.keys.map(key => key.slice('sl:session:'.length)));
      entries.push(...rows.filter(row => row.deviceRef === deviceRef && row.status === 'active'));
    } while (cursor !== 0);
    return this.endMany(entries, reason);
  }
}

function createRedisSessionStore(options) { return new RedisSessionStore(options); }
module.exports = { RedisSessionStore, createRedisSessionStore, ACQUIRE_SCRIPT };
