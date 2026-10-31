const db = require('../../config/db');
const webhookEventRepository = require('./webhookEventRepository');
const { buildPayload } = require('./webhookPayloadProjector');

function mapEndpoint(row) {
  if (!row) return null;
  return {
    id: row.id, tenantId: row.tenant_id, name: row.name, url: row.url,
    eventTypes: row.event_types || [], status: row.status, secretPrefix: row.secret_prefix,
    secretVersion: Number(row.secret_version), lastDeliveryAt: row.last_delivery_at,
    lastSuccessAt: row.last_success_at, successRate: row.success_rate === null || row.success_rate === undefined ? null : Number(row.success_rate),
    deliveryCount: Number(row.delivery_count || 0), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapDelivery(row) {
  if (!row) return null;
  return {
    id: row.id, endpointId: row.endpoint_id, endpointName: row.endpoint_name,
    tenantId: row.tenant_id, jobId: row.job_id, eventId: row.event_id,
    eventType: row.event_type, payload: row.payload, status: row.status,
    attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts),
    availableAt: row.available_at, deliveredAt: row.delivered_at,
    lastHttpStatus: row.last_http_status, lastError: row.last_error,
    replayOfId: row.replay_of_id, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function safeEndpoint(endpoint) {
  if (!endpoint) return null;
  const { secretCiphertext, secretIv, secretTag, ...safe } = endpoint;
  return safe;
}

async function audit(executor, { actorId, action, requestId, reason, tenantId, resourceId, before, after }) {
  await executor.query(
    `INSERT INTO ai_scoring_admin_audit_events
       (actor_id,action,resource_type,resource_id,tenant_id,reason,request_id,before_state,after_state)
     VALUES ($1,$2,'WEBHOOK',$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
    [actorId || null, action, resourceId, tenantId, reason || null, requestId,
      before ? JSON.stringify(safeEndpoint(before)) : null, after ? JSON.stringify(safeEndpoint(after)) : null]
  );
}

class WebhookRepository {
  constructor(database = db) { this.db = database; }

  async tenantById(id, executor = this.db) {
    const result = await executor.query('SELECT * FROM integration_tenants WHERE id=$1', [id]);
    return result.rows[0] || null;
  }

  async listEndpoints(tenantId) {
    const result = await this.db.query(
      `SELECT endpoint.*,
              COUNT(delivery.id)::integer AS delivery_count,
              CASE WHEN COUNT(delivery.id)=0 THEN NULL ELSE
                ROUND(100.0 * COUNT(delivery.id) FILTER (WHERE delivery.status='DELIVERED') / COUNT(delivery.id), 2)
              END AS success_rate
       FROM integration_webhook_endpoints endpoint
       LEFT JOIN integration_webhook_deliveries delivery ON delivery.endpoint_id=endpoint.id
       WHERE endpoint.tenant_id=$1
       GROUP BY endpoint.id ORDER BY endpoint.created_at DESC`, [tenantId]
    );
    return result.rows.map(mapEndpoint);
  }

  async findEndpoint(id, executor = this.db) {
    const result = await executor.query('SELECT * FROM integration_webhook_endpoints WHERE id=$1', [id]);
    const row = result.rows[0];
    if (!row) return null;
    return { ...mapEndpoint(row), secretCiphertext: row.secret_ciphertext, secretIv: row.secret_iv, secretTag: row.secret_tag };
  }

  async createEndpoint(tenantId, input, material, context) {
    return this.db.transaction(async executor => {
      const tenant = await this.tenantById(tenantId, executor);
      if (!tenant) return null;
      const result = await executor.query(
        `INSERT INTO integration_webhook_endpoints
           (tenant_id,name,url,event_types,status,secret_prefix,secret_ciphertext,secret_iv,secret_tag,created_by)
         VALUES ($1,$2,$3,$4::jsonb,'ACTIVE',$5,$6,$7,$8,$9) RETURNING *`,
        [tenantId, input.name, input.url, JSON.stringify(input.eventTypes), material.prefix,
          material.ciphertext, material.iv, material.tag, context.actorId || null]
      );
      const endpoint = await this.findEndpoint(result.rows[0].id, executor);
      await audit(executor, { ...context, action: 'WEBHOOK_CREATED', tenantId, resourceId: endpoint.id, after: endpoint });
      return { endpoint, tenant };
    });
  }

  async updateEndpoint(id, input, context) {
    return this.db.transaction(async executor => {
      const before = await this.findEndpoint(id, executor);
      if (!before) return null;
      const result = await executor.query(
        `UPDATE integration_webhook_endpoints SET
           name=COALESCE($2,name), url=COALESCE($3,url), event_types=COALESCE($4::jsonb,event_types),
           status=COALESCE($5,status), updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id`,
        [id, input.name || null, input.url || null, input.eventTypes ? JSON.stringify(input.eventTypes) : null, input.status || null]
      );
      const endpoint = await this.findEndpoint(result.rows[0].id, executor);
      await audit(executor, { ...context, action: 'WEBHOOK_UPDATED', tenantId: endpoint.tenantId, resourceId: id, before, after: endpoint });
      return endpoint;
    });
  }

  async rotateSecret(id, material, context) {
    return this.db.transaction(async executor => {
      const before = await this.findEndpoint(id, executor);
      if (!before) return null;
      await executor.query(
        `UPDATE integration_webhook_endpoints SET secret_prefix=$2,secret_ciphertext=$3,secret_iv=$4,
           secret_tag=$5,secret_version=secret_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [id, material.prefix, material.ciphertext, material.iv, material.tag]
      );
      const endpoint = await this.findEndpoint(id, executor);
      await audit(executor, { ...context, action: 'WEBHOOK_SECRET_ROTATED', tenantId: endpoint.tenantId, resourceId: id, before, after: endpoint });
      return endpoint;
    });
  }

  async createDelivery({ endpointId, tenantId, jobId = null, eventId, eventType, payload, replayOfId = null, actorId = null }) {
    const result = await this.db.query(
      `INSERT INTO integration_webhook_deliveries
         (endpoint_id,tenant_id,job_id,event_id,event_type,payload,replay_of_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
      [endpointId, tenantId, jobId, eventId, eventType, JSON.stringify(payload), replayOfId, actorId]
    );
    return mapDelivery(result.rows[0]);
  }

  async listDeliveries({ tenantId, endpointId, status, eventType, page, pageSize }) {
    const params = [tenantId]; const where = ['delivery.tenant_id=$1'];
    if (endpointId) { params.push(endpointId); where.push(`delivery.endpoint_id=$${params.length}`); }
    if (status) { params.push(status); where.push(`delivery.status=$${params.length}`); }
    if (eventType) { params.push(eventType); where.push(`delivery.event_type=$${params.length}`); }
    params.push(pageSize, (page - 1) * pageSize);
    const result = await this.db.query(
      `SELECT delivery.*,endpoint.name AS endpoint_name,COUNT(*) OVER()::integer AS total_count
       FROM integration_webhook_deliveries delivery
       JOIN integration_webhook_endpoints endpoint ON endpoint.id=delivery.endpoint_id
       WHERE ${where.join(' AND ')} ORDER BY delivery.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );
    return { items: result.rows.map(mapDelivery), page, pageSize, total: Number(result.rows[0]?.total_count || 0) };
  }

  async deliveryById(id, tenantId, executor = this.db) {
    const result = await executor.query(
      `SELECT delivery.*,endpoint.name AS endpoint_name FROM integration_webhook_deliveries delivery
       JOIN integration_webhook_endpoints endpoint ON endpoint.id=delivery.endpoint_id
       WHERE delivery.id=$1 AND delivery.tenant_id=$2`, [id, tenantId]
    );
    return mapDelivery(result.rows[0]);
  }

  async deliveryDetail(id, tenantId) {
    const delivery = await this.deliveryById(id, tenantId);
    if (!delivery) return null;
    const attempts = await this.db.query(
      `SELECT id,attempt_number,request_headers,response_status,response_headers,response_excerpt,
              error_code,error_message,latency_ms,started_at,finished_at
       FROM integration_webhook_attempts WHERE delivery_id=$1 ORDER BY attempt_number DESC`, [id]
    );
    return { ...delivery, attempts: attempts.rows.map(row => ({
      id: row.id, attemptNumber: row.attempt_number, requestHeaders: row.request_headers,
      responseStatus: row.response_status, responseHeaders: row.response_headers,
      responseExcerpt: row.response_excerpt, errorCode: row.error_code,
      errorMessage: row.error_message, latencyMs: row.latency_ms,
      startedAt: row.started_at, finishedAt: row.finished_at,
    })) };
  }

  async replay(id, tenantId, eventId, context) {
    return this.db.transaction(async executor => {
      const original = await this.deliveryById(id, tenantId, executor);
      if (!original) return null;
      let payload = original.payload;
      if (original.eventType === 'scoring.completed' && original.jobId) {
        const submission = await executor.query(
          'SELECT id FROM iig_submissions WHERE scoring_job_id=$1',
          [original.jobId]
        );
        const scoringResult = submission.rows[0]
          ? await webhookEventRepository.loadCompletedResult(executor, submission.rows[0].id)
          : null;
        if (scoringResult) {
          payload = buildPayload({
            eventId,
            occurredAt: new Date().toISOString(),
            ...scoringResult,
          });
        }
      }
      const result = await executor.query(
        `INSERT INTO integration_webhook_deliveries
           (endpoint_id,tenant_id,job_id,event_id,event_type,payload,replay_of_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
        [original.endpointId, tenantId, original.jobId, eventId, original.eventType,
          JSON.stringify(payload), original.id, context.actorId || null]
      );
      const delivery = mapDelivery(result.rows[0]);
      await audit(executor, { ...context, action: 'WEBHOOK_DELIVERY_REPLAYED', reason: context.reason,
        tenantId, resourceId: original.endpointId, after: { deliveryId: delivery.id, replayOfId: original.id } });
      return delivery;
    });
  }

  async claimNext(workerId) {
    return this.db.transaction(async executor => {
      const result = await executor.query(
        `WITH candidate AS (
           SELECT delivery.id FROM integration_webhook_deliveries delivery
           JOIN integration_webhook_endpoints endpoint ON endpoint.id=delivery.endpoint_id
           JOIN integration_tenants tenant ON tenant.id=delivery.tenant_id
           WHERE delivery.status IN ('PENDING','RETRY') AND delivery.available_at<=CURRENT_TIMESTAMP
             AND endpoint.status='ACTIVE' AND tenant.status='ACTIVE'
           ORDER BY delivery.available_at,delivery.created_at FOR UPDATE OF delivery SKIP LOCKED LIMIT 1
         )
         UPDATE integration_webhook_deliveries delivery SET status='PROCESSING',locked_at=CURRENT_TIMESTAMP,
           locked_by=$1,attempt_count=attempt_count+1,updated_at=CURRENT_TIMESTAMP
         FROM candidate WHERE delivery.id=candidate.id RETURNING delivery.*`, [workerId]
      );
      if (!result.rows[0]) return null;
      const delivery = mapDelivery(result.rows[0]);
      const endpoint = await this.findEndpoint(delivery.endpointId, executor);
      return { ...delivery, endpoint };
    });
  }

  async recordResult(delivery, result) {
    return this.db.transaction(async executor => {
      const delivered = result.success;
      const retry = !delivered && result.retryable && delivery.attemptCount < delivery.maxAttempts;
      const status = delivered ? 'DELIVERED' : retry ? 'RETRY' : 'DEAD_LETTER';
      const delaySeconds = Math.min(300, 5 * (2 ** Math.max(0, delivery.attemptCount - 1)));
      await executor.query(
        `INSERT INTO integration_webhook_attempts
           (delivery_id,attempt_number,request_headers,response_status,response_headers,response_excerpt,
            error_code,error_message,latency_ms,finished_at)
         VALUES ($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9,CURRENT_TIMESTAMP)`,
        [delivery.id, delivery.attemptCount, JSON.stringify(result.requestHeaders || {}), result.httpStatus || null,
          JSON.stringify(result.responseHeaders || {}), result.responseExcerpt || null,
          result.errorCode || null, result.errorMessage || null, result.latencyMs || null]
      );
      await executor.query(
        `UPDATE integration_webhook_deliveries SET status=$2::varchar(24),available_at=CASE WHEN $2::varchar(24)='RETRY'
           THEN CURRENT_TIMESTAMP+($3::text||' seconds')::interval ELSE available_at END,
           delivered_at=CASE WHEN $2::varchar(24)='DELIVERED' THEN CURRENT_TIMESTAMP ELSE delivered_at END,
           last_http_status=$4,last_error=$5,locked_at=NULL,locked_by=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [delivery.id, status, delaySeconds, result.httpStatus || null, result.errorMessage || null]
      );
      await executor.query(
        `UPDATE integration_webhook_endpoints SET last_delivery_at=CURRENT_TIMESTAMP,
           last_success_at=CASE WHEN $2::boolean THEN CURRENT_TIMESTAMP ELSE last_success_at END,
           updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [delivery.endpointId, delivered]
      );
      return { status, delaySeconds: retry ? delaySeconds : null };
    });
  }

  async recoverStale(staleMinutes = 5) {
    await this.db.query(
      `UPDATE integration_webhook_deliveries SET status='RETRY',available_at=CURRENT_TIMESTAMP,
         locked_at=NULL,locked_by=NULL,last_error='Recovered stale delivery',updated_at=CURRENT_TIMESTAMP
       WHERE status='PROCESSING' AND locked_at<CURRENT_TIMESTAMP-($1::text||' minutes')::interval`, [staleMinutes]
    );
  }
}

const repository = new WebhookRepository();
repository.WebhookRepository = WebhookRepository;
repository.mapEndpoint = mapEndpoint;
repository.mapDelivery = mapDelivery;
module.exports = repository;
