const axios = require('axios');
const HttpError = require('../http/httpError');

const cleanBaseUrl = value => String(value || '').trim().replace(/\/$/, '');

function parseAnalysis(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { return null; }
}

async function analyzeText({ sourceId, sourceText, sourceType, userId }) {
  const baseUrl = cleanBaseUrl(process.env.CONTENT_ANALYSIS_DIFY_API_URL);
  const apiKey = String(process.env.CONTENT_ANALYSIS_DIFY_API_KEY || '').trim();
  if (!baseUrl || !apiKey) throw new HttpError('Chưa cấu hình Dify cho phân tích nguồn.', 503, 'CONTENT_DIFY_NOT_CONFIGURED');

  let response;
  try {
    response = await axios.post(`${baseUrl}/workflows/run`, {
      inputs: {
        source_id: sourceId,
        source_text: sourceText,
        source_type: sourceType || 'text',
        exam: 'TOEIC',
        language: 'vi',
        schema_version: 'source-analysis-v2'
      },
      response_mode: 'blocking',
      user: String(userId)
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: Number(process.env.CONTENT_ANALYSIS_DIFY_TIMEOUT_MS) || 120000
    });
  } catch (error) {
    const detail = error.response?.data?.message || error.response?.data?.error || error.message;
    throw new HttpError(detail || 'Dify không thể phân tích nguồn.', 502, 'CONTENT_DIFY_FAILED');
  }

  const data = response.data?.data || response.data || {};
  const outputs = data.outputs || {};
  const analysis = parseAnalysis(outputs.analysis ?? outputs.analysis_json ?? outputs.result ?? outputs.text);
  if (!analysis) throw new HttpError('Dify không trả về analysis JSON hợp lệ.', 502, 'CONTENT_DIFY_INVALID_RESPONSE');

  return {
    analysis,
    provider: 'dify',
    schemaVersion: outputs.schema_version || analysis.schema_version || 'source-analysis-v2',
    providerRunId: data.workflow_run_id || response.data?.workflow_run_id || null,
    model: 'dify:content-analysis-v2',
    usage: {
      ...(data.total_tokens != null ? { totalTokenCount: Number(data.total_tokens) } : {}),
      ...(data.total_price != null ? { totalPrice: data.total_price } : {}),
      ...(data.currency ? { currency: data.currency } : {}),
      ...(data.elapsed_time != null ? { elapsedTime: Number(data.elapsed_time) } : {})
    }
  };
}

module.exports = { analyzeText, parseAnalysis };
