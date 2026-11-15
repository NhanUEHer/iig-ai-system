import { idempotencyConfig } from './aiScoringIdempotency';
import api from './api';

const unwrap = response => response.data.data;

export async function listTenants(params = {}) {
  return unwrap(await api.get('/ai-scoring/tenants', { params }));
}

export async function getTenant(id) {
  return unwrap(await api.get(`/ai-scoring/tenants/${id}`));
}

export async function createTenant(payload) {
  return unwrap(await api.post('/ai-scoring/tenants', payload, idempotencyConfig()));
}

export async function updateTenant(id, payload) {
  return unwrap(await api.patch(`/ai-scoring/tenants/${id}`, payload, idempotencyConfig()));
}

export async function changeTenantStatus(id, action, reason) {
  return unwrap(await api.post(`/ai-scoring/tenants/${id}/${action}`, { reason }, idempotencyConfig()));
}

export async function listTenantAudit(id, params = {}) {
  return unwrap(await api.get(`/ai-scoring/tenants/${id}/audit-events`, { params }));
}

export async function listTenantCredentials(tenantId) {
  return unwrap(await api.get(`/ai-scoring/tenants/${tenantId}/credentials`));
}

export async function createTenantCredential(tenantId, payload) {
  return unwrap(await api.post(`/ai-scoring/tenants/${tenantId}/credentials`, payload, idempotencyConfig()));
}

export async function updateTenantCredential(credentialId, payload) {
  return unwrap(await api.patch(`/ai-scoring/credentials/${credentialId}`, payload, idempotencyConfig()));
}

export async function rotateTenantCredential(credentialId, payload) {
  return unwrap(await api.post(`/ai-scoring/credentials/${credentialId}/rotate`, payload, idempotencyConfig()));
}

export async function revokeTenantCredential(credentialId, reason) {
  return unwrap(await api.post(`/ai-scoring/credentials/${credentialId}/revoke`, { reason }, idempotencyConfig()));
}

export async function listTenantWebhooks(tenantId) {
  return unwrap(await api.get(`/ai-scoring/tenants/${tenantId}/webhooks`));
}

export async function createTenantWebhook(tenantId, payload) {
  return unwrap(await api.post(`/ai-scoring/tenants/${tenantId}/webhooks`, payload, idempotencyConfig()));
}

export async function updateTenantWebhook(webhookId, payload) {
  return unwrap(await api.patch(`/ai-scoring/webhooks/${webhookId}`, payload, idempotencyConfig()));
}

export async function rotateTenantWebhookSecret(webhookId) {
  return unwrap(await api.post(`/ai-scoring/webhooks/${webhookId}/rotate-secret`, undefined, idempotencyConfig()));
}

export async function testTenantWebhook(webhookId) {
  return unwrap(await api.post(`/ai-scoring/webhooks/${webhookId}/test`, undefined, idempotencyConfig()));
}

export async function listWebhookDeliveries(params) {
  return unwrap(await api.get('/ai-scoring/webhook-deliveries', { params }));
}

export async function getWebhookDelivery(deliveryId, tenantId) {
  return unwrap(await api.get(`/ai-scoring/webhook-deliveries/${deliveryId}`, { params: { tenantId } }));
}

export async function replayWebhookDelivery(deliveryId, tenantId, reason) {
  return unwrap(await api.post(`/ai-scoring/webhook-deliveries/${deliveryId}/replay`, { tenantId, reason }, idempotencyConfig()));
}
