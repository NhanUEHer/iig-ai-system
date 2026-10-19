const axios = require('axios');
const db = require('../config/db');
const HttpError = require('../http/httpError');

function workflowEndpoint(value) {
  const base = String(value || '').trim().replace(/\/$/, '');
  return base.endsWith('/workflows/run') ? base : `${base}/workflows/run`;
}

async function resolveAgent() {
  const result = await db.query(
    `SELECT api_endpoint, api_key FROM ai_agents
     WHERE api_type = 'Gen Key Vocab'
     ORDER BY updated_at DESC LIMIT 1`
  );
  if (result.rows[0]) return result.rows[0];
  const fallback = {
    api_endpoint: String(process.env.KEY_VOCAB_DIFY_API_URL || '').trim(),
    api_key: String(process.env.KEY_VOCAB_DIFY_API_KEY || '').trim()
  };
  if (!fallback.api_endpoint || !fallback.api_key) {
    throw new HttpError('Chưa cấu hình Agent Gen Key Vocab.', 503, 'KEY_VOCAB_NOT_CONFIGURED');
  }
  return fallback;
}

async function generate(passage, userId, targetScore, selectionMode) {
  const agent = await resolveAgent();
  try {
    const response = await axios.post(workflowEndpoint(agent.api_endpoint), {
      inputs: {
        reading_content: passage,
        // Dify Select inputs require strings even though the application stores
        // the TOEIC level as a number.
        target_score: String(targetScore),
        selection_mode: selectionMode
      },
      response_mode: 'blocking',
      user: `academy-admin-${userId}`
    }, {
      headers: { Authorization: `Bearer ${agent.api_key}`, 'Content-Type': 'application/json' },
      timeout: Number(process.env.KEY_VOCAB_DIFY_TIMEOUT_MS) || 120000
    });
    return response.data;
  } catch (error) {
    const detail = error.response?.data?.message || error.response?.data?.error;
    throw new HttpError(detail || 'AI Academy không thể tạo Key Vocab lúc này.', 502, 'KEY_VOCAB_PROVIDER_ERROR');
  }
}

module.exports = { generate, resolveAgent };
