const db = require('../../../config/db');

const PREVIEW_MAX_BYTES = 20 * 1024;
const ERROR_MAX_CHARS = 500;

function value(entry, camel, snake = camel) {
  return entry[camel] ?? entry[snake];
}

function redactSecrets(text) {
  return String(text)
    .replace(/\b(Bearer)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(
      /(["']?(?:api[_-]?key|x-goog-api-key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,&]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/([?&](?:key|api[_-]?key)=)[^&#\s]+/gi, '$1[REDACTED]');
}

function truncateUtf8(valueToTruncate, maxBytes) {
  if (valueToTruncate === null || valueToTruncate === undefined) return null;
  const text = typeof valueToTruncate === 'string'
    ? valueToTruncate
    : JSON.stringify(valueToTruncate);
  let result = '';
  let bytes = 0;
  for (const character of redactSecrets(text)) {
    const size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

function truncateCharacters(valueToTruncate, maxCharacters) {
  if (valueToTruncate === null || valueToTruncate === undefined) return null;
  return Array.from(redactSecrets(valueToTruncate)).slice(0, maxCharacters).join('');
}

function previewEnabled(entry) {
  return value(entry, 'mode') === 'test'
    || Boolean(value(entry, 'logPayload', 'log_payload'))
    || Boolean(entry.agent?.logPayload ?? entry.agent?.log_payload);
}

function createCallLog(database = db, options = {}) {
  const logError = options.logError || (() => console.error('[AI Core] Failed to write call log.'));

  async function write(entry = {}) {
    try {
      const includePreview = previewEnabled(entry);
      const requestPreview = includePreview
        ? truncateUtf8(value(entry, 'requestPreview', 'request_preview'), PREVIEW_MAX_BYTES)
        : null;
      const responsePreview = includePreview
        ? truncateUtf8(value(entry, 'responsePreview', 'response_preview'), PREVIEW_MAX_BYTES)
        : null;
      const errorMessage = truncateCharacters(
        value(entry, 'errorMessage', 'error_message'),
        ERROR_MAX_CHARS,
      );

      const params = [
        value(entry, 'agentId', 'agent_id') || null,
        value(entry, 'versionId', 'version_id') || null,
        value(entry, 'agentKey', 'agent_key'),
        value(entry, 'version') ?? null,
        value(entry, 'mode') || 'run',
        value(entry, 'feature'),
        value(entry, 'refType', 'ref_type') || null,
        value(entry, 'refId', 'ref_id') || null,
        value(entry, 'userId', 'user_id') || null,
        value(entry, 'provider') || null,
        value(entry, 'model') || null,
        value(entry, 'connectionId', 'connection_id') || null,
        Boolean(value(entry, 'usedFallback', 'used_fallback')),
        Number(value(entry, 'attempts') || 0),
        value(entry, 'status'),
        value(entry, 'errorCode', 'error_code') || null,
        errorMessage,
        value(entry, 'finishReason', 'finish_reason') || null,
        Number(value(entry, 'inputTokens', 'input_tokens') || 0),
        Number(value(entry, 'cachedInputTokens', 'cached_input_tokens') || 0),
        Number(value(entry, 'outputTokens', 'output_tokens') || 0),
        Number(value(entry, 'thinkingTokens', 'thinking_tokens') || 0),
        Number(value(entry, 'estimatedMaxCostUsd', 'estimated_max_cost_usd') || 0),
        Number(value(entry, 'costUsd', 'cost_usd') || 0),
        JSON.stringify(value(entry, 'priceSnapshot', 'price_snapshot') || {}),
        value(entry, 'schemaValidFirstTry', 'schema_valid_first_try') ?? null,
        Boolean(value(entry, 'repaired')),
        value(entry, 'latencyMs', 'latency_ms') ?? null,
        requestPreview,
        responsePreview,
      ];

      const result = await database.query(
        `INSERT INTO aic_call_logs (
           agent_id, version_id, agent_key, version, mode, feature, ref_type, ref_id, user_id,
           provider, model, connection_id, used_fallback, attempts, status, error_code,
           error_message, finish_reason, input_tokens, cached_input_tokens, output_tokens,
           thinking_tokens, estimated_max_cost_usd, cost_usd, price_snapshot,
           schema_valid_first_try, repaired, latency_ms, request_preview, response_preview
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22,$23,$24,$25::jsonb,$26,$27,$28,$29,$30
         ) RETURNING id`,
        params,
      );
      return result.rows[0]?.id || null;
    } catch (_error) {
      try { logError(); } catch (_logError) { /* Logging must never affect the caller. */ }
      return null;
    }
  }

  return { write };
}

const callLog = createCallLog();

module.exports = {
  ...callLog,
  createCallLog,
  truncateUtf8,
  truncateCharacters,
  redactSecrets,
  PREVIEW_MAX_BYTES,
  ERROR_MAX_CHARS,
};
