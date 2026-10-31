const { createHash, randomBytes } = require('node:crypto');
const HttpError = require('../../http/httpError');
const repository = require('./credentialRepository');
const validator = require('./credentialValidator');

function generateMaterial(environment = 'PRODUCTION') {
  const marker = environment === 'PRODUCTION' ? 'live' : environment === 'BETA' ? 'beta' : 'dev';
  const token = `iig_${marker}_${randomBytes(32).toString('base64url')}`;
  return { token, prefix: token.slice(0, 16), hash: createHash('sha256').update(token).digest('hex') };
}

function ensureScopes(tenant, scopes) {
  const allowed = new Set(tenant.allowed_scopes || []);
  const denied = scopes.filter(scope => !allowed.has(scope));
  if (denied.length) throw new HttpError('Credential có scope vượt phạm vi tenant.', 422, 'CREDENTIAL_SCOPE_EXCEEDED', { field: 'scopes', denied });
}

class CredentialService {
  constructor(credentialRepository = repository) { this.repository = credentialRepository; }

  async list(tenantId) {
    const tenant = await this.repository.tenantById(tenantId);
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    return { items: await this.repository.list(tenantId) };
  }

  async create(tenantId, body, context) {
    const input = validator.createInput(body);
    const tenant = await this.repository.tenantById(tenantId);
    if (!tenant) throw new HttpError('Không tìm thấy tenant.', 404, 'TENANT_NOT_FOUND');
    if (tenant.status !== 'ACTIVE') throw new HttpError('Tenant phải hoạt động trước khi tạo credential.', 409, 'TENANT_NOT_ACTIVE');
    ensureScopes(tenant, input.scopes);
    const material = generateMaterial(tenant.environment);
    const created = await this.repository.create(tenantId, input, { prefix: material.prefix, hash: material.hash }, context);
    return { ...created.credential, secret: material.token };
  }

  async update(id, body, context) {
    const input = validator.updateInput(body);
    const current = await this.repository.findById(id);
    if (!current) throw new HttpError('Không tìm thấy credential.', 404, 'CREDENTIAL_NOT_FOUND');
    const tenant = await this.repository.tenantById(current.tenantId);
    ensureScopes(tenant, input.scopes);
    const result = await this.repository.update(id, input, context);
    if (result.blocked) throw new HttpError('Credential đã bị thu hồi.', 409, 'CREDENTIAL_REVOKED');
    return result.credential;
  }

  async revoke(id, body, context) {
    const result = await this.repository.revoke(id, validator.reason(body), context);
    if (!result) throw new HttpError('Không tìm thấy credential.', 404, 'CREDENTIAL_NOT_FOUND');
    return result.credential;
  }

  async rotate(id, body, context) {
    const input = validator.rotateInput(body);
    const current = await this.repository.findById(id);
    if (!current) throw new HttpError('Không tìm thấy credential.', 404, 'CREDENTIAL_NOT_FOUND');
    const tenant = await this.repository.tenantById(current.tenantId);
    if (tenant.status !== 'ACTIVE') throw new HttpError('Tenant phải hoạt động trước khi rotate credential.', 409, 'TENANT_NOT_ACTIVE');
    const material = generateMaterial(tenant.environment);
    const result = await this.repository.rotate(id, { prefix: material.prefix, hash: material.hash }, input, context);
    if (result.blocked) throw new HttpError('Credential đã bị thu hồi.', 409, 'CREDENTIAL_REVOKED');
    return { ...result.credential, secret: material.token };
  }
}

const service = new CredentialService();
service.CredentialService = CredentialService;
service.generateMaterial = generateMaterial;
service.ensureScopes = ensureScopes;
module.exports = service;
