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
    providerAvailable: row.provider_available ?? null,
    syncedAt: row.synced_at ?? null,
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
                 context_window, effective_from, status, provider_available, synced_at`,
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
              context_window, effective_from, status, provider_available, synced_at
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

  // Mirror the provider's own model list: add new models (disabled, no price), flag removed ones.
  // Providers do not publish prices through their API, so prices stay as entered by admins.
  async function syncProviderModels(provider, details) {
    const ids = [...new Set((details || []).map(item => item.id))];
    const work = async client => {
      for (const item of details || []) {
        await client.query(
          `INSERT INTO aic_models (provider, model, price_in_per_m, price_cached_in_per_m, price_out_per_m,
                                   context_window, status, provider_available, synced_at)
           VALUES ($1,$2,0,0,0,COALESCE($3,0),'disabled',TRUE,CURRENT_TIMESTAMP)
           ON CONFLICT (provider, model) DO UPDATE SET
             provider_available=TRUE, synced_at=CURRENT_TIMESTAMP,
             context_window=CASE WHEN aic_models.context_window > 0 THEN aic_models.context_window
                                 ELSE COALESCE($3, aic_models.context_window) END`,
          [provider, item.id, item.contextWindow || null],
        );
      }
      const removed = await client.query(
        `UPDATE aic_models SET provider_available=FALSE, status='disabled', synced_at=CURRENT_TIMESTAMP
          WHERE provider=$1 AND model <> ALL($2::text[]) AND model <> 'fake-demo'
          RETURNING model`,
        [provider, ids],
      );
      return { added: ids.length, unavailable: removed.rows.map(row => row.model) };
    };
    const result = typeof database.transaction === 'function' ? await database.transaction(work) : await work(database);
    clearCache();
    return result;
  }

  return { getPrice, savePrice, setPrice: savePrice, list, saveMany, clearCache, syncProviderModels };
}

const store = createPriceStore();

module.exports = { ...store, createPriceStore, toPrice, CACHE_TTL_MS };
