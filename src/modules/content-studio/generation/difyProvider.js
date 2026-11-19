'use strict';

// Content Studio Dify adapter. It is opt-in through CONTENT_STUDIO_PROVIDER=dify;
// mock remains the default. Only the two dictionary workflows are defined by T02.
const axios = require('axios');
const HttpError = require('../../../http/httpError');

const baseUrl = () => String(process.env.CONTENT_STUDIO_DIFY_API_URL || '').replace(/\/$/, '');
const endpoint = () => `${baseUrl()}/workflows/run`;

async function run(apiKey, inputs, { signal } = {}) {
  if (!baseUrl() || !apiKey) throw new HttpError('Chưa cấu hình Content Studio Dify.', 503, 'CONTENT_STUDIO_DIFY_NOT_CONFIGURED');
  try {
    const response = await axios.post(endpoint(), {
      inputs,
      response_mode: 'blocking',
      user: 'content-studio-worker',
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 150000,
      signal,
    });
    if (response.data?.data?.status === 'failed') throw new Error(response.data.data.error || 'Workflow failed');
    return response.data;
  } catch (error) {
    if (error.code === 'ERR_CANCELED' || error.code === 'ECONNABORTED') {
      throw new HttpError('Dify không trả kết quả trong thời gian cho phép.', 504, 'DICTIONARY_PROVIDER_TIMEOUT');
    }
    throw new HttpError(error.response?.data?.message || error.message || 'Content Studio Dify thất bại.', 502, 'CONTENT_STUDIO_DIFY_ERROR');
  }
}

async function generate(type, input, options) {
  if (type === 'dictionary_extract') {
    return run(process.env.CONTENT_STUDIO_DIFY_EXTRACT_API_KEY, { reading_content: input.passage }, options);
  }
  if (type === 'dictionary_entries') {
    return run(process.env.CONTENT_STUDIO_DIFY_DICTIONARY_API_KEY, {
      passage: input.passage,
      sentence: input.sentence,
      target_chunk: JSON.stringify(input.targetChunks),
    }, options);
  }
  throw new Error(`Unsupported Content Studio Dify type: ${type}`);
}

module.exports = { name: 'dify', generate };
