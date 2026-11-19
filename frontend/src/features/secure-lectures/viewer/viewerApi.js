// Public, unauthenticated calls for the teacher viewer (/v/:token).
// Never attaches the admin JWT; the device cookie is httpOnly and sent by the browser.
const BASE = '/api/public/lectures';

export class ViewerError extends Error {
  constructor(code, message, data, status) {
    super(message || code);
    this.code = code;
    this.data = data;
    this.status = status;
  }
}

async function post(path, body) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new ViewerError('NETWORK', 'Mất kết nối');
  }
  if (response.status === 204) return null;
  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (response.ok && payload?.success) return payload.data;
  const error = payload?.error;
  const code = typeof error === 'object' ? error?.code : payload?.code;
  throw new ViewerError(code || (response.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN'),
    typeof error === 'object' ? error?.message : error, error?.data, response.status);
}

function clientInfo() {
  return {
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    platform: navigator.userAgentData?.platform || navigator.platform || '',
  };
}

export const openSession = token => post('/session', { token, client: clientInfo() });
export const takeoverSession = (token, kickSessionId) => post('/session/takeover', { token, kickSessionId, client: clientInfo() });
export const heartbeat = sessionId => post('/heartbeat', { sessionId });
export const reportEvent = (sessionId, type) => post('/event', { sessionId, type }).catch(() => null);
export const contentUrl = ticket => `${BASE}/content/${encodeURIComponent(ticket)}`;

export function endSession(sessionId) {
  if (!sessionId) return;
  const body = JSON.stringify({ sessionId });
  if (navigator.sendBeacon?.(`${BASE}/end`, new Blob([body], { type: 'text/plain' }))) return;
  fetch(`${BASE}/end`, { method: 'POST', credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body }).catch(() => {});
}

// Map an error code to the screen the teacher sees (designs/SL5).
export function screenForError(error) {
  switch (error?.code) {
    case 'CONCURRENT_LIMIT': return 'concurrent';
    case 'SESSION_KICKED': return 'kicked';
    case 'DEVICE_LIMIT': return 'deviceLimit';
    case 'DEVICE_BLOCKED': return 'deviceBlocked';
    case 'DEVICE_REMOVED': return 'deviceRemoved';
    case 'LINK_EXPIRED': return 'expired';
    case 'LINK_REVOKED': return 'revoked';
    case 'LINK_NOT_STARTED': return 'notStarted';
    case 'RATE_LIMITED': return 'rateLimited';
    case 'NETWORK': return 'network';
    case 'LINK_INVALID': return 'invalid';
    default: return 'invalid';
  }
}
