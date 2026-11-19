const { normalizeThrownError, providerErrorFromHttp } = require('./normalize');

function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`;
}

async function readErrorDetail(response) {
  try {
    const body = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
    try { const json = JSON.parse(body); return json.error?.message || json.message || body; } catch { return body; }
  } catch { return ''; }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60000;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (typeof timeout.unref === 'function') timeout.unref();

  const externalSignal = options.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  try {
    const response = await fetch(url, {
      method: options.method || 'POST',
      headers: options.headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = providerErrorFromHttp(response.status, response.headers?.get?.('retry-after'));
      // Keep the provider's own reason so logs explain 4xx failures, with any credential stripped.
      const detail = await readErrorDetail(response);
      const secrets = Object.values(options.headers || {}).map(value => String(value).replace(/^Bearer\s+/i, '')).filter(value => value.length >= 8);
      let clean = String(detail || '').replace(/\s+/g, ' ').replace(/https?:\/\/\S+/g, '[url]');
      for (const secret of secrets) clean = clean.split(secret).join('[redacted]');
      if (clean) error.message = `${error.message} ${clean.slice(0, 300)}`;
      throw error;
    }
    return await response.json();
  } catch (error) {
    throw normalizeThrownError(error, timedOut);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternal);
  }
}

module.exports = { fetchJson, joinUrl };
