const db = require('../../../config/db');

const SECRET_FIELDS = /(?:api.?key|cipher|secret|password|access.?token|refresh.?token|\biv\b|\btag\b)/i;

function safeFields(fields) {
  return [...new Set((fields || [])
    .map(field => String(field))
    .filter(field => field && !SECRET_FIELDS.test(field)))].sort();
}

function createAudit(database = db) {
  async function write({ resourceType, resourceId, action, actorId = null, fields = [] }) {
    await database.query(
      `INSERT INTO aic_audit_logs (
         resource_type, resource_id, action, actor_id, changed_fields
       ) VALUES ($1,$2,$3,$4,$5::jsonb)`,
      [resourceType, String(resourceId), action, actorId, JSON.stringify(safeFields(fields))],
    );
  }

  return { write };
}

const audit = createAudit();

module.exports = { ...audit, createAudit, safeFields };
