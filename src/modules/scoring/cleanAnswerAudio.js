const submissionRepository = require('../submissions/submissionRepository');
const evaluationRepository = require('./evaluationRepository');
const tokenManager = require('../../services/tokenManager');
const iigClient = require('../../clients/iigClient');
const audioCleanerService = require('../../services/audioCleanerService');
const storageService = require('../../services/storageService');
const ScoringError = require('./scoringError');

async function cleanAnswerAudio(input, dependencies = {}) {
  const {
    submissions = submissionRepository,
    evaluations = evaluationRepository,
    tokens = tokenManager,
    iig = iigClient,
    cleaner = audioCleanerService,
    storage = storageService
  } = dependencies;
  const { answerId, method = 'ai', publicOrigin } = input;

  if (!answerId) throw new ScoringError('answerId is required.', 400);
  const answer = await submissions.findAnswerById(answerId);
  if (!answer) throw new ScoringError('Không tìm thấy câu trả lời.', 404);
  if (!answer.student_audio_file_id) {
    throw new ScoringError('Câu trả lời thiếu file ghi âm.', 400);
  }

  const token = await tokens.ensureFreshToken();
  const sourceUrl = await iig.getMigratedFileUrl(answer.student_audio_file_id, token);
  if (!sourceUrl) {
    throw new ScoringError('Không thể giải quyết URL tệp ghi âm từ IIG.', 404);
  }

  const cleaned = await cleaner.cleanAudio(sourceUrl, answer.student_audio_file_id, method);
  let storedUrl = cleaned.urlPath;
  let responseUrl = cleaned.urlPath;

  if (storage.isR2Key(cleaned.urlPath)) {
    try {
      responseUrl = await storage.getSignedAudioUrl(cleaned.urlPath);
    } catch (error) {
      responseUrl = null;
    }
  } else {
    storedUrl = publicOrigin ? `${publicOrigin}${cleaned.urlPath}` : cleaned.urlPath;
    responseUrl = storedUrl;
  }

  await evaluations.upsertCleanedAudio(answerId, storedUrl);
  return {
    answerId,
    originalFileId: answer.student_audio_file_id,
    cleanedAudioUrl: responseUrl,
    methodUsed: cleaned.methodUsed
  };
}

async function cleanAnswersAudio(input, dependencies = {}) {
  const answerIds = [...new Set(Array.isArray(input.answerIds) ? input.answerIds.filter(Boolean) : [])];
  if (!answerIds.length) throw new ScoringError('Vui lòng chọn ít nhất một câu có audio.', 400);
  if (answerIds.length > 50) throw new ScoringError('Chỉ được làm sạch tối đa 50 câu mỗi lần.', 400);
  const results = [];
  const queue = [...answerIds];
  const worker = async () => {
    while (queue.length) {
      const answerId = queue.shift();
      try {
        const data = await cleanAnswerAudio({ ...input, answerId }, dependencies);
        results.push({ answerId, status: 'success', data });
      } catch (error) {
        results.push({ answerId, status: 'error', error: error.message });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, answerIds.length) }, worker));
  return { total: answerIds.length, success: results.filter(item => item.status === 'success').length, failed: results.filter(item => item.status === 'error').length, results };
}

module.exports = cleanAnswerAudio;
module.exports.cleanAnswersAudio = cleanAnswersAudio;
