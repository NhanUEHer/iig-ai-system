const db = require('../../../config/db');
const defaultSecrets = require('./secrets');

const PUBLIC_COLUMNS = `
  id, provider, name, api_key_last4, key_version, base_url, status,
  last_check_at, last_check_ok, last_check_ms, last_check_error,
  created_by, updated_by, created_at, updated_at`;
const SECRET_COLUMNS = `${PUBLIC_COLUMNS}, api_key_ciphertext, api_key_iv, api_key_tag`;

function toDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    apiKeyLast4: row.api_key_last4,
    keyVersion: Number(row.key_version),
    baseUrl: row.base_url,
    status: row.status,
    lastCheckAt: row.last_check_at,
    lastCheckOk: row.last_check_ok,
    lastCheckMs: row.last_check_ms,
    lastCheckError: row.last_check_error,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createConnectionStore(database = db, secrets = defaultSecrets) {
  async function create(data, userId = null) {
    const encrypted = secrets.encrypt(data.apiKey);
    const result = await database.query(
      `INSERT INTO aic_connections (
         provider, name, api_key_ciphertext, api_key_iv, api_key_tag,
         api_key_last4, key_version, base_url, status, created_by, updated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
       RETURNING ${PUBLIC_COLUMNS}`,
      [
        data.provider,
        data.name,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
        encrypted.last4,
        encrypted.keyVersion,
        data.baseUrl || null,
        data.status || 'active',
        userId,
      ],
    );
    return toDto(result.rows[0]);
  }

  async function update(id, data, userId = null) {
    const fields = [];
    const values = [id];
    const add = (column, value) => {
      values.push(value);
      fields.push(`${column}=$${values.length}`);
    };

    if (data.name !== undefined) add('name', data.name);
    if (data.baseUrl !== undefined) add('base_url', data.baseUrl || null);
    if (data.status !== undefined) add('status', data.status);
    if (data.apiKey !== undefined) {
      const encrypted = secrets.encrypt(data.apiKey);
      add('api_key_ciphertext', encrypted.ciphertext);
      add('api_key_iv', encrypted.iv);
      add('api_key_tag', encrypted.tag);
      add('api_key_last4', encrypted.last4);
      add('key_version', encrypted.keyVersion);
    }

    add('updated_by', userId);
    fields.push('updated_at=CURRENT_TIMESTAMP');
    const result = await database.query(
      `UPDATE aic_connections SET ${fields.join(', ')} WHERE id=$1 RETURNING ${PUBLIC_COLUMNS}`,
      values,
    );
    secrets.clearCache();
    return toDto(result.rows[0]);
  }

  async function findRow(id, includeSecret = false) {
    const result = await database.query(
      `SELECT ${includeSecret ? SECRET_COLUMNS : PUBLIC_COLUMNS} FROM aic_connections WHERE id=$1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async function get(id) {
    return toDto(await findRow(id));
  }

  async function getWithKey(id) {
    const row = await findRow(id, true);
    if (!row) return null;
    return { ...toDto(row), apiKey: secrets.decrypt(row) };
  }

  async function list() {
    const result = await database.query(
      `SELECT ${PUBLIC_COLUMNS} FROM aic_connections ORDER BY LOWER(name), id`,
    );
    return result.rows.map(toDto);
  }

  return { create, update, get, getWithKey, list };
}

const store = createConnectionStore();

module.exports = { ...store, createConnectionStore, toDto };
