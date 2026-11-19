const db = require('../../../config/db');
const HttpError = require('../../../http/httpError');

const EXPORT_LIMIT = 50000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_COLUMNS = `id, agent_key, version, mode, feature, ref_type, ref_id, user_id,
  provider, model, connection_id, used_fallback, attempts, status, error_code,
  error_message, finish_reason, input_tokens, cached_input_tokens, output_tokens,
  thinking_tokens, estimated_max_cost_usd, cost_usd, price_snapshot, schema_valid_first_try,
  repaired, latency_ms, created_at`;

function toDto(row, includePreview = false) {
  if (!row) return null;
  const dto = {
    id: row.id, agentKey: row.agent_key, version: row.version == null ? null : Number(row.version),
    mode: row.mode, feature: row.feature, refType: row.ref_type, refId: row.ref_id,
    userId: row.user_id, provider: row.provider, model: row.model, connectionId: row.connection_id,
    usedFallback: Boolean(row.used_fallback), attempts: Number(row.attempts), status: row.status,
    errorCode: row.error_code, errorMessage: row.error_message, finishReason: row.finish_reason,
    inputTokens: Number(row.input_tokens), cachedInputTokens: Number(row.cached_input_tokens),
    outputTokens: Number(row.output_tokens), thinkingTokens: Number(row.thinking_tokens),
    estimatedMaxCostUsd: Number(row.estimated_max_cost_usd), costUsd: Number(row.cost_usd),
    priceSnapshot: jsonValue(row.price_snapshot, {}),
    schemaValidFirstTry: row.schema_valid_first_try, repaired: Boolean(row.repaired),
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms), createdAt: row.created_at,
  };
  if (includePreview) {
    dto.requestPreview = row.request_preview;
    dto.responsePreview = row.response_preview;
  }
  return dto;
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify([new Date(row.created_at).toISOString(), row.id])).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(value) || value.length !== 2 || Number.isNaN(Date.parse(value[0])) || !UUID_PATTERN.test(value[1])) throw new Error();
    return value;
  } catch (_error) {
    throw new HttpError('Invalid log cursor.', 400, 'AI_CORE_INVALID_CURSOR');
  }
}

function filters(query, { cursor = true } = {}) {
  if (query.status && !['success', 'failed', 'blocked'].includes(query.status)) {
    throw new HttpError('Invalid log status.', 400, 'AI_CORE_INVALID_FILTER');
  }
  for (const field of ['from', 'to']) {
    if (query[field] && Number.isNaN(Date.parse(query[field]))) {
      throw new HttpError(`Invalid ${field} timestamp.`, 400, 'AI_CORE_INVALID_FILTER');
    }
  }
  const clauses = [];
  const values = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace('?', `$${values.length}`)); };
  if (query.agentKey) add('agent_key=?', query.agentKey);
  if (query.status) add('status=?', query.status);
  if (query.from) add('created_at>=?::timestamptz', query.from);
  if (query.to) add('created_at<=?::timestamptz', query.to);
  if (query.refType) add('ref_type=?', query.refType);
  if (query.refId) add('ref_id=?', query.refId);
  if (cursor && query.cursor) {
    const [createdAt, id] = decodeCursor(query.cursor);
    values.push(createdAt, id);
    clauses.push(`(created_at,id)<($${values.length - 1}::timestamptz,$${values.length}::uuid)`);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
}

function createLogService(database = db) {
  async function list(query = {}) {
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
    const built = filters(query);
    const result = await database.query(
      `SELECT ${LIST_COLUMNS} FROM aic_call_logs ${built.where}
       ORDER BY created_at DESC, id DESC LIMIT $${built.values.length + 1}`,
      [...built.values, pageSize + 1],
    );
    const hasMore = result.rows.length > pageSize;
    const rows = result.rows.slice(0, pageSize);
    return { items: rows.map(row => toDto(row)), nextCursor: hasMore ? encodeCursor(rows.at(-1)) : null };
  }

  async function detail(id, includePreview = false) {
    const previewColumns = includePreview ? ', request_preview, response_preview' : '';
    const result = await database.query(
      `SELECT ${LIST_COLUMNS}${previewColumns} FROM aic_call_logs WHERE id=$1`, [id],
    );
    return toDto(result.rows[0], includePreview);
  }

  async function exportRows(query = {}) {
    const built = filters(query, { cursor: false });
    const result = await database.query(
      `SELECT ${LIST_COLUMNS} FROM aic_call_logs ${built.where}
       ORDER BY created_at DESC, id DESC LIMIT ${EXPORT_LIMIT}`,
      built.values,
    );
    return result.rows.map(row => toDto(row));
  }

  return { list, detail, exportRows };
}

function csv(rows) {
  const columns = [
    'id', 'createdAt', 'agentKey', 'version', 'mode', 'feature', 'refType', 'refId',
    'userId', 'provider', 'model', 'connectionId', 'usedFallback', 'attempts', 'status',
    'errorCode', 'errorMessage', 'finishReason', 'inputTokens', 'cachedInputTokens',
    'outputTokens', 'thinkingTokens', 'estimatedMaxCostUsd', 'costUsd', 'priceSnapshot',
    'schemaValidFirstTry', 'repaired', 'latencyMs',
  ];
  const cell = value => {
    const normalized = value && typeof value === 'object' ? JSON.stringify(value) : value;
    const text = String(normalized ?? '');
    const spreadsheetSafe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
  };
  return [columns.join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\n');
}

function jsonValue(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch (_error) { return fallback; }
}

const service = createLogService();
module.exports = { ...service, createLogService, toDto, encodeCursor, decodeCursor, csv, EXPORT_LIMIT };
