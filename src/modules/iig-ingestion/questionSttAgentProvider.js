function findConfiguredQuestionSttAgent({ apiType, sttTarget, questionType }, env = process.env) {
  if (apiType !== 'STT' || !['question', 'context'].includes(sttTarget) || !questionType) return null;
  const endpoint = String(env.IIG_QUESTION_STT_DIFY_ENDPOINT || '').trim();
  const apiKey = String(env.IIG_QUESTION_STT_DIFY_API_KEY || '').trim();
  if (!endpoint || !apiKey) return null;
  return {
    id: null,
    api_endpoint: endpoint,
    api_key: apiKey,
    api_type: 'STT',
    stt_target: sttTarget,
    target_questions: [questionType],
  };
}

module.exports = { findConfiguredQuestionSttAgent };
