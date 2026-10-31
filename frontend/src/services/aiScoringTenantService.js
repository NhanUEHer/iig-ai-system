import api from './api';

const unwrap = response => response.data.data;

export async function listTenants(params = {}) {
  return unwrap(await api.get('/ai-scoring/tenants', { params }));
}

export async function getTenant(id) {
  return unwrap(await api.get(`/ai-scoring/tenants/${id}`));
}

export async function createTenant(payload) {
  return unwrap(await api.post('/ai-scoring/tenants', payload));
}

export async function updateTenant(id, payload) {
  return unwrap(await api.patch(`/ai-scoring/tenants/${id}`, payload));
}

export async function changeTenantStatus(id, action, reason) {
  return unwrap(await api.post(`/ai-scoring/tenants/${id}/${action}`, { reason }));
}

export async function listTenantAudit(id, params = {}) {
  return unwrap(await api.get(`/ai-scoring/tenants/${id}/audit-events`, { params }));
}

export async function listTenantCredentials(tenantId) {
  return unwrap(await api.get(`/ai-scoring/tenants/${tenantId}/credentials`));
}

export async function createTenantCredential(tenantId, payload) {
  return unwrap(await api.post(`/ai-scoring/tenants/${tenantId}/credentials`, payload));
}

export async function updateTenantCredential(credentialId, payload) {
  return unwrap(await api.patch(`/ai-scoring/credentials/${credentialId}`, payload));
}

export async function rotateTenantCredential(credentialId, payload) {
  return unwrap(await api.post(`/ai-scoring/credentials/${credentialId}/rotate`, payload));
}

export async function revokeTenantCredential(credentialId, reason) {
  return unwrap(await api.post(`/ai-scoring/credentials/${credentialId}/revoke`, { reason }));
}

export async function listTenantWebhooks(tenantId) {
  return unwrap(await api.get(`/ai-scoring/tenants/${tenantId}/webhooks`));
}

export async function createTenantWebhook(tenantId, payload) {
  return unwrap(await api.post(`/ai-scoring/tenants/${tenantId}/webhooks`, payload));
}

export async function updateTenantWebhook(webhookId, payload) {
  return unwrap(await api.patch(`/ai-scoring/webhooks/${webhookId}`, payload));
}

export async function rotateTenantWebhookSecret(webhookId) {
  return unwrap(await api.post(`/ai-scoring/webhooks/${webhookId}/rotate-secret`));
}

export async function testTenantWebhook(webhookId) {
  return unwrap(await api.post(`/ai-scoring/webhooks/${webhookId}/test`));
}

export async function listWebhookDeliveries(params) {
  return unwrap(await api.get('/ai-scoring/webhook-deliveries', { params }));
}

export async function getWebhookDelivery(deliveryId, tenantId) {
  return unwrap(await api.get(`/ai-scoring/webhook-deliveries/${deliveryId}`, { params: { tenantId } }));
}

export async function replayWebhookDelivery(deliveryId, tenantId, reason) {
  return unwrap(await api.post(`/ai-scoring/webhook-deliveries/${deliveryId}/replay`, { tenantId, reason }));
}
