const axios = require('axios');
const https = require('https');
const HttpError = require('../http/httpError');

const endpoint = () => `${String(process.env.DICTIONARY_DIFY_API_URL || 'https://dify.iigvn.site/v1').replace(/\/$/, '')}/workflows/run`;
const developmentHttpsAgent = () => process.env.NODE_ENV !== 'production' && process.env.DICTIONARY_ALLOW_SELF_SIGNED_CERT === 'true'
  ? new https.Agent({ rejectUnauthorized: false })
  : undefined;

async function run(apiKey, inputs, userId) {
  if (!apiKey) throw new HttpError('Chưa cấu hình workflow Dictionary.', 503, 'DICTIONARY_NOT_CONFIGURED');
  try {
    const response = await axios.post(endpoint(), {
      inputs, response_mode: 'blocking', user: `academy-admin-${userId}`
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      httpsAgent: developmentHttpsAgent(),
      timeout: Number(process.env.DICTIONARY_DIFY_TIMEOUT_MS) || 120000
    });
    if (response.data?.data?.status === 'failed') throw new Error(response.data.data.error || 'Workflow failed');
    return response.data;
  } catch (error) {
    const responseBody = error.response?.data;
    if (typeof responseBody === 'string' && /Web Page Blocked|bị chặn theo chính sách/i.test(responseBody)) {
      throw new HttpError('Mạng hiện tại đang chặn dify.iigvn.site. Vui lòng yêu cầu IT allowlist domain hoặc đổi sang mạng được phép truy cập.', 503, 'DIFY_NETWORK_BLOCKED');
    }
    const detail = error.response?.data?.message || error.response?.data?.error || error.message;
    throw new HttpError(detail || 'AI Academy không thể tạo Dictionary lúc này.', 502, 'DICTIONARY_PROVIDER_ERROR');
  }
}

const extractItems = (passage, userId) => run(process.env.DICTIONARY_EXTRACT_DIFY_API_KEY, { reading_content: passage }, userId);
const generateEntry = (passage, sentence, targetChunk, userId) => run(process.env.DICTIONARY_ENTRY_DIFY_API_KEY, {
  passage,
  sentence,
  target_chunk: targetChunk
}, userId);

module.exports = { extractItems, generateEntry };
