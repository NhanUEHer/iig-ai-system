const db = require('../../../config/db');
const { AiCoreError } = require('../errors');

const CACHE_TTL_MS = 60 * 1000;

function toPrice(row) {
  if (!row) return null;
  return {
    provider: row.provider,
    model: row.model,
    in: Number(row.price_in_per_m),
    cachedIn: Number(row.price_cached_in_per_m),
    out: Number(row.price_out_per_m),
    contextWindow: Number(row.context_window),
    effectiveFrom: row.effective_from,
    status: row.status,
  };
}

function configMissing(provider, model) {
  return new AiCoreError('CONFIG_MISSING', `Pricing is not configured for ${provider}/${model}.`);
}

function createPriceStore(database = db, options = {}) {
  const cache = new Map();
  const now = options.now || Date.now;

  function cacheKey(provider, model) {
    return `${provider}\u0000${model}`;
  }

  function clearCache(provider, model) {
    if (provider !== undefined && model !== undefined) cache.delete(cacheKey(provider, model));
    else cache.clear();
  }

  async function getPrice(provider, model) {
    const key = cacheKey(provider, model);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.price;
    if (cached) cache.delete(key);

    const result = await database.query(
      `SELECT provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m,
              context_window, effective_from, status
         FROM aic_models
        WHERE provider=$1 AND model=$2`,
      [provider, model],
    );
    const price = toPrice(result.rows[0]);
    if (!price || price.status !== 'active') throw configMissing(provider, model);
    cache.set(key, { price, expiresAt: now() + CACHE_TTL_MS });
    return price;
  }

  async function savePrice(data) {
    const result = await database.query(
      `INSERT INTO aic_models (
         provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m,
         context_window, effective_from, status
       ) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,$7)
       ON CONFLICT (provider, model) DO UPDATE SET
         price_in_per_m=EXCLUDED.price_in_per_m,
         price_cached_in_per_m=EXCLUDED.price_cached_in_per_m,
         price_out_per_m=EXCLUDED.price_out_per_m,
         context_window=EXCLUDED.context_window,
         effective_from=CASE WHEN
           aic_models.price_in_per_m IS DISTINCT FROM EXCLUDED.price_in_per_m OR
           aic_models.price_cached_in_per_m IS DISTINCT FROM EXCLUDED.price_cached_in_per_m OR
           aic_models.price_out_per_m IS DISTINCT FROM EXCLUDED.price_out_per_m
           THEN CURRENT_TIMESTAMP ELSE aic_models.effective_from END,
         status=EXCLUDED.status
       RETURNING provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m,
                 context_window, effective_from, status`,
      [
        data.provider,
        data.model,
        data.in ?? data.priceIn,
        data.cachedIn ?? data.priceCachedIn,
        data.out ?? data.priceOut,
        data.contextWindow,
        data.status || 'active',
      ],
    );
    clearCache(data.provider, data.model);
    return toPrice(result.rows[0]);
  }

  async function list() {
    const result = await database.query(
      `SELECT provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m,
              context_window, effective_from, status
         FROM aic_models
        ORDER BY provider, model`,
    );
    return result.rows.map(toPrice);
  }

  async function saveMany(items) {
    const work = async client => {
      const transactional = createPriceStore(client, { now });
      const saved = [];
      for (const item of items) saved.push(await transactional.savePrice(item));
      return saved;
    };
    const saved = typeof database.transaction === 'function' ? await database.transaction(work) : await work(database);
    clearCache();
    return saved;
  }

  return { getPrice, savePrice, setPrice: savePrice, list, saveMany, clearCache };
}

const store = createPriceStore();

module.exports = { ...store, createPriceStore, toPrice, CACHE_TTL_MS };
