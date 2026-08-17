const axios = require('axios');
const HttpError = require('../http/httpError');

function endpoint() {
  const base = String(process.env.KEY_VOCAB_DIFY_API_URL || '').trim().replace(/\/$/, '');
  if (!base) throw new HttpError('Chưa cấu hình KEY_VOCAB_DIFY_API_URL.', 503, 'KEY_VOCAB_NOT_CONFIGURED');
  return base.endsWith('/workflows/run') ? base : `${base}/workflows/run`;
}

async function generate(passage, userId) {
  const apiKey = String(process.env.KEY_VOCAB_DIFY_API_KEY || '').trim();
  if (!apiKey) throw new HttpError('Chưa cấu hình KEY_VOCAB_DIFY_API_KEY.', 503, 'KEY_VOCAB_NOT_CONFIGURED');
  try {
    const response = await axios.post(endpoint(), {
      inputs: { reading_content: passage },
      response_mode: 'blocking',
      user: `academy-admin-${userId}`
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: Number(process.env.KEY_VOCAB_DIFY_TIMEOUT_MS) || 120000
    });
    return response.data;
  } catch (error) {
    const detail = error.response?.data?.message || error.response?.data?.error;
    throw new HttpError(detail || 'AI Academy không thể tạo Key Vocab lúc này.', 502, 'KEY_VOCAB_PROVIDER_ERROR');
  }
}

module.exports = { generate };
