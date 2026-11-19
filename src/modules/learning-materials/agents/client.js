'use strict';

// “Tạo học liệu” → AI Core. Same input contract as the old Dify workflows; prompts, model,
// limits and budgets live in the AI Core agents lm.key_vocab / lm.dict.detect / lm.dict.define.
// Each call resolves to { output, callId }: output is the agent's JSON, callId the AI Core call log id
// (stored where the Dify workflow_run_id used to go).
const aiCore = require('../../ai-core');
const HttpError = require('../../../http/httpError');
const { AGENT_KEYS } = require('./definitions');

const MESSAGES = {
  CONFIG_MISSING: 'Chưa cấu hình hoặc chưa publish Agent trên AI Core.',
  AGENT_PAUSED: 'Agent AI Core đang tạm dừng.',
  INPUT_TOO_LARGE: 'Đoạn văn vượt giới hạn đầu vào của Agent.',
  COST_CEILING: 'Yêu cầu vượt trần chi phí cho một lần gọi.',
  QUOTA_EXCEEDED: 'Agent đã chạm ngân sách hoặc giới hạn đồng thời. Vui lòng thử lại sau.',
  TIMEOUT: 'AI không trả kết quả trong thời gian cho phép.',
};

async function run(key, variables, { userId, refType, refId, fallbackMessage }) {
  try {
    const result = await aiCore.run(key, variables, { feature: 'learning-material', refType, refId: refId || null, userId });
    return { output: result.data, callId: result.callId || null };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const code = error?.code;
    const status = error?.httpStatus || 502;
    const httpError = new HttpError(MESSAGES[code] || fallbackMessage, status, code ? `AI_CORE_${code}` : 'AI_CORE_ERROR');
    httpError.retryable = error?.retryable !== false;
    throw httpError;
  }
}

const generateKeyVocab = (passage, userId, targetScore, selectionMode) => run(AGENT_KEYS.keyVocab, {
  reading_content: passage,
  target_score: String(targetScore),
  selection_mode: selectionMode,
}, { userId, refType: 'key_vocab', fallbackMessage: 'AI Academy không thể tạo Key Vocab lúc này.' });

const extractItems = (passage, userId) => run(AGENT_KEYS.dictionaryDetect, { reading_content: passage },
  { userId, refType: 'dictionary_generation', fallbackMessage: 'AI Academy không thể tách từ cho Dictionary lúc này.' });

const generateEntries = (passage, sentence, targetChunks, userId, options = {}) => run(AGENT_KEYS.dictionaryDefine, {
  passage,
  sentence,
  target_chunk: JSON.stringify(Array.isArray(targetChunks) ? targetChunks : [targetChunks]),
}, { userId, refType: 'dictionary_candidate', refId: options.refId, fallbackMessage: 'AI Academy không thể tạo Dictionary lúc này.' });

module.exports = { generateKeyVocab, extractItems, generateEntries };
