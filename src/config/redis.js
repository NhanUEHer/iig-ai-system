const { createClient } = require('redis');

const REDIS_URL = String(process.env.REDIS_URL || '').trim();
let client = null;
let connecting = null;

function configured() {
  return Boolean(REDIS_URL);
}

async function connection() {
  if (!configured()) return null;
  if (client?.isReady) return client;
  if (connecting) return connecting;
  client = client || createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 500),
      reconnectStrategy: retries => retries >= 2 ? false : Math.min(100 * (retries + 1), 300),
    },
  });
  client.on('error', error => console.error('[Redis]', error.message));
  connecting = client.connect().then(() => client).catch(error => {
    console.error('[Redis] Connection unavailable; continuing with PostgreSQL fallback:', error.message);
    try { client?.destroy(); } catch {}
    client = null;
    return null;
  }).finally(() => { connecting = null; });
  return connecting;
}

async function get(key) {
  try { return (await connection())?.get(key) ?? null; }
  catch (error) { console.error('[Redis] GET failed:', error.message); return null; }
}

async function set(key, value, options) {
  try { const active = await connection(); return active ? active.set(key, value, options) : null; }
  catch (error) { console.error('[Redis] SET failed:', error.message); return null; }
}

async function remove(key) {
  try { const active = await connection(); return active ? active.del(key) : 0; }
  catch (error) { console.error('[Redis] DEL failed:', error.message); return 0; }
}

async function hSet(key, field, value) {
  try { const active = await connection(); return active ? active.hSet(key, field, value) : null; }
  catch (error) { console.error('[Redis] HSET failed:', error.message); return null; }
}

async function hGetAll(key) {
  try { const active = await connection(); return active ? active.hGetAll(key) : null; }
  catch (error) { console.error('[Redis] HGETALL failed:', error.message); return null; }
}

async function expire(key, seconds) {
  try { const active = await connection(); return active ? active.expire(key, seconds) : false; }
  catch (error) { console.error('[Redis] EXPIRE failed:', error.message); return false; }
}

async function hSetExpiring(key, field, value, seconds) {
  try {
    const active = await connection();
    if (!active) return null;
    const result = await active.multi().hSet(key, field, value).expire(key, seconds).exec();
    return result?.[0] ?? null;
  } catch (error) { console.error('[Redis] HSET+EXPIRE failed:', error.message); return null; }
}

async function close() {
  if (client?.isOpen) await client.quit().catch(() => client.destroy());
  client = null;
}

module.exports = { configured, connection, get, set, remove, hSet, hGetAll, expire, hSetExpiring, close };
