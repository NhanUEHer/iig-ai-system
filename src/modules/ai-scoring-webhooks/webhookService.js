const { randomUUID } = require('node:crypto');
const HttpError = require('../../http/httpError');
const repository = require('./webhookRepository');
const validator = require('./webhookValidator');
const { generateSecret, encryptSecret } = require('./webhookSecret');

function secretMaterial(secret) {
  return { prefix: secret.slice(0, 14), ...encryptSecret(secret) };
}

function duplicateError(error) {
  if (error?.code === '23505') throw new HttpError('Tên webhook đã tồn tại trong tenant.', 409, 'WEBHOOK_NAME_EXISTS', { field: 'name' });
  throw error;
}

class WebhookService {
  constructor(webhookRepository = repository) { this.repository = webhookRepository; }

  async listEndpoints(tenantId) {
    const tenant = await this.repository.tenantById(tenantId);
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    return { items: await this.repository.listEndpoints(tenantId) };
  }

  async createEndpoint(tenantId, body, context) {
    const input = await validator.endpointInput(body);
    const tenant = await this.repository.tenantById(tenantId);
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    if (tenant.status !== 'ACTIVE') throw new HttpError('Tenant phải hoạt động trước khi tạo webhook.', 409, 'TENANT_NOT_ACTIVE');
    const secret = generateSecret();
    try {
      const created = await this.repository.createEndpoint(tenantId, input, secretMaterial(secret), context);
      return { ...created.endpoint, secret };
    } catch (error) { return duplicateError(error); }
  }

  async updateEndpoint(id, body, context) {
    const input = await validator.endpointInput(body, { partial: true });
    if (!Object.keys(input).length) throw new HttpError('Không có trường nào để cập nhật.', 422, 'WEBHOOK_NO_CHANGES');
    try {
      const endpoint = await this.repository.updateEndpoint(id, input, context);
      if (!endpoint) throw new HttpError('Không tìm thấy webhook.', 404, 'WEBHOOK_NOT_FOUND');
      return endpoint;
    } catch (error) { return duplicateError(error); }
  }

  async rotateSecret(id, context) {
    const current = await this.repository.findEndpoint(id);
    if (!current) throw new HttpError('Không tìm thấy webhook.', 404, 'WEBHOOK_NOT_FOUND');
    const secret = generateSecret();
    const endpoint = await this.repository.rotateSecret(id, secretMaterial(secret), context);
    return { ...endpoint, secret };
  }

  async testEndpoint(id, context) {
    const endpoint = await this.repository.findEndpoint(id);
    if (!endpoint) throw new HttpError('Không tìm thấy webhook.', 404, 'WEBHOOK_NOT_FOUND');
    if (endpoint.status !== 'ACTIVE') throw new HttpError('Kích hoạt webhook trước khi gửi thử.', 409, 'WEBHOOK_DISABLED');
    await validator.resolveSafeUrl(endpoint.url);
    const eventId = randomUUID();
    return this.repository.createDelivery({
      endpointId: endpoint.id, tenantId: endpoint.tenantId, eventId,
      eventType: 'scoring.completed', actorId: context.actorId,
      payload: { id: eventId, type: 'scoring.completed', test: true, createdAt: new Date().toISOString(), data: { message: 'IIG AI Scoring webhook test' } },
    });
  }

  async listDeliveries(query = {}) {
    if (!query.tenantId) throw new HttpError('tenantId là bắt buộc.', 422, 'WEBHOOK_TENANT_REQUIRED', { field: 'tenantId' });
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 25));
    return this.repository.listDeliveries({ tenantId: query.tenantId, endpointId: query.endpointId || null,
      status: query.status || null, eventType: query.eventType || null, page, pageSize });
  }

  async deliveryDetail(id, tenantId) {
    if (!tenantId) throw new HttpError('tenantId là bắt buộc.', 422, 'WEBHOOK_TENANT_REQUIRED', { field: 'tenantId' });
    const delivery = await this.repository.deliveryDetail(id, tenantId);
    if (!delivery) throw new HttpError('Không tìm thấy delivery.', 404, 'WEBHOOK_DELIVERY_NOT_FOUND');
    return delivery;
  }

  async replay(id, body, context) {
    const tenantId = String(body?.tenantId || '');
    const reason = String(body?.reason || '').trim();
    if (!tenantId) throw new HttpError('tenantId là bắt buộc.', 422, 'WEBHOOK_TENANT_REQUIRED');
    if (reason.length < 3) throw new HttpError('Nhập lý do replay.', 422, 'WEBHOOK_REPLAY_REASON_REQUIRED', { field: 'reason' });
    const delivery = await this.repository.replay(id, tenantId, randomUUID(), { ...context, reason });
    if (!delivery) throw new HttpError('Không tìm thấy delivery.', 404, 'WEBHOOK_DELIVERY_NOT_FOUND');
    return delivery;
  }
}

const service = new WebhookService();
service.WebhookService = WebhookService;
service.secretMaterial = secretMaterial;
module.exports = service;
