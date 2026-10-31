const https = require('node:https');
const { resolveSafeUrl } = require('./webhookValidator');

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 64 * 1024;

function sendOnce({ target, addresses, body, headers, timeoutMs = 10_000 }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const selected = addresses[0];
    const request = https.request(target, {
      method: 'POST', headers, timeout: timeoutMs, servername: target.hostname,
      lookup: (_hostname, options, callback) => options?.all
        ? callback(null, [{ address: selected.address, family: selected.family }])
        : callback(null, selected.address, selected.family),
    }, response => {
      const chunks = []; let size = 0; let truncated = false;
      response.on('data', chunk => {
        if (size < MAX_RESPONSE_BYTES) {
          const remaining = MAX_RESPONSE_BYTES - size;
          chunks.push(chunk.subarray(0, remaining)); size += Math.min(chunk.length, remaining);
          if (chunk.length > remaining) truncated = true;
        } else truncated = true;
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8'), truncated, latencyMs: Date.now() - startedAt }));
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('Webhook request timed out.'), { code: 'WEBHOOK_TIMEOUT' })));
    request.on('error', reject);
    request.end(body);
  });
}

async function sendWebhook({ url, body, headers, timeoutMs, resolver }, redirectCount = 0) {
  const resolved = await resolveSafeUrl(url, resolver);
  const result = await sendOnce({ target: resolved.url, addresses: resolved.addresses, body, headers, timeoutMs });
  if (result.status >= 300 && result.status < 400 && result.headers.location) {
    if (redirectCount >= MAX_REDIRECTS) throw Object.assign(new Error('Webhook redirect limit exceeded.'), { code: 'WEBHOOK_REDIRECT_LIMIT' });
    const nextUrl = new URL(result.headers.location, resolved.url).toString();
    return sendWebhook({ url: nextUrl, body, headers, timeoutMs, resolver }, redirectCount + 1);
  }
  return result;
}

module.exports = { MAX_REDIRECTS, MAX_RESPONSE_BYTES, sendWebhook, sendOnce };
