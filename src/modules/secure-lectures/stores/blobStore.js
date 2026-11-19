const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const storageService = require('../../../services/storageService');
const config = require('../config');

const DEFAULT_CACHE_BYTES = 100 * 1024 * 1024;
const DEFAULT_LOCAL_ROOT = path.resolve(__dirname, '../../../../storage');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizePrefix(value) {
  return String(value || 'secure-lectures').replace(/^\/+|\/+$/g, '');
}

function normalizeKey(key, prefix) {
  const raw = String(key || '').replace(/^\/+/, '');
  if (!raw || raw.includes('\\') || raw.split('/').includes('..')) {
    throw new Error('Invalid secure lecture storage key.');
  }
  return raw === prefix || raw.startsWith(`${prefix}/`) ? raw : `${prefix}/${raw}`;
}

class Sha256LruCache {
  constructor(maxBytes = DEFAULT_CACHE_BYTES) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.entries = new Map();
  }

  get(hash) {
    const value = this.entries.get(hash);
    if (!value) return null;
    this.entries.delete(hash);
    this.entries.set(hash, value);
    return Buffer.from(value);
  }

  set(hash, buffer) {
    if (buffer.length > this.maxBytes) return;
    const existing = this.entries.get(hash);
    if (existing) {
      this.bytes -= existing.length;
      this.entries.delete(hash);
    }
    const value = Buffer.from(buffer);
    this.entries.set(hash, value);
    this.bytes += value.length;
    while (this.bytes > this.maxBytes && this.entries.size > 0) {
      const oldestHash = this.entries.keys().next().value;
      const oldest = this.entries.get(oldestHash);
      this.entries.delete(oldestHash);
      this.bytes -= oldest.length;
    }
  }
}

class BlobStore {
  constructor({
    mode = storageService.mediaStorageMode,
    prefix = config.storagePrefix,
    localRoot = DEFAULT_LOCAL_ROOT,
    storage = storageService,
    cacheBytes = DEFAULT_CACHE_BYTES,
  } = {}) {
    this.mode = mode === 'r2' ? 'r2' : 'local';
    this.prefix = normalizePrefix(prefix);
    this.localRoot = path.resolve(localRoot);
    this.storage = storage;
    this.cache = new Sha256LruCache(cacheBytes);
    this.keyHashes = new Map();
  }

  key(key) {
    return normalizeKey(key, this.prefix);
  }

  localPath(key) {
    const target = path.resolve(this.localRoot, key);
    if (!target.startsWith(`${this.localRoot}${path.sep}`)) {
      throw new Error('Invalid secure lecture storage key.');
    }
    return target;
  }

  async put(key, buffer, contentType = 'text/html; charset=utf-8') {
    const storageKey = this.key(key);
    const value = Buffer.from(buffer);
    if (this.mode === 'r2') {
      await this.storage.uploadBuffer(value, storageKey, contentType, { requireRemote: true });
    } else {
      const target = this.localPath(storageKey);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, value);
    }
    const hash = sha256(value);
    this.keyHashes.set(storageKey, hash);
    this.cache.set(hash, value);
    return storageKey;
  }

  async get(key) {
    const storageKey = this.key(key);
    const knownHash = this.keyHashes.get(storageKey);
    const cached = knownHash ? this.cache.get(knownHash) : null;
    if (cached) return cached;

    const value = this.mode === 'r2'
      ? Buffer.from((await this.storage.downloadBuffer(storageKey, { requireRemote: true })).buffer)
      : await fs.readFile(this.localPath(storageKey));
    const hash = sha256(value);
    this.keyHashes.set(storageKey, hash);
    this.cache.set(hash, value);
    return Buffer.from(value);
  }

  async remove(key) {
    const storageKey = this.key(key);
    if (this.mode === 'r2') {
      await this.storage.deleteFile(storageKey, { requireRemote: true });
    } else {
      await fs.rm(this.localPath(storageKey), { force: true });
    }
    this.keyHashes.delete(storageKey);
  }
}

class MemoryBlobStore {
  constructor({ prefix = config.storagePrefix, cacheBytes = DEFAULT_CACHE_BYTES } = {}) {
    this.prefix = normalizePrefix(prefix);
    this.blobs = new Map();
    this.cache = new Sha256LruCache(cacheBytes);
    this.keyHashes = new Map();
  }

  key(key) {
    return normalizeKey(key, this.prefix);
  }

  async put(key, buffer) {
    const storageKey = this.key(key);
    const value = Buffer.from(buffer);
    const hash = sha256(value);
    this.blobs.set(storageKey, value);
    this.keyHashes.set(storageKey, hash);
    this.cache.set(hash, value);
    return storageKey;
  }

  async get(key) {
    const storageKey = this.key(key);
    const hash = this.keyHashes.get(storageKey);
    const cached = hash ? this.cache.get(hash) : null;
    if (cached) return cached;
    const value = this.blobs.get(storageKey);
    if (!value) {
      const error = new Error(`Blob not found: ${storageKey}`);
      error.code = 'ENOENT';
      throw error;
    }
    const computedHash = sha256(value);
    this.keyHashes.set(storageKey, computedHash);
    this.cache.set(computedHash, value);
    return Buffer.from(value);
  }

  async remove(key) {
    const storageKey = this.key(key);
    this.keyHashes.delete(storageKey);
    return this.blobs.delete(storageKey);
  }
}

function createBlobStore(options) {
  return new BlobStore(options);
}

function createMemoryBlobStore(options) {
  return new MemoryBlobStore(options);
}

module.exports = {
  BlobStore,
  MemoryBlobStore,
  Sha256LruCache,
  createBlobStore,
  createMemoryBlobStore,
  DEFAULT_CACHE_BYTES,
  DEFAULT_LOCAL_ROOT,
};
