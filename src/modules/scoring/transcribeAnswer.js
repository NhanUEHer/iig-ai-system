const submissionRepository = require('../submissions/submissionRepository');
const evaluationRepository = require('./evaluationRepository');
const { selectAgent } = require('./agentSelector');
const tokenManager = require('../../services/tokenManager');
const iigClient = require('../../clients/iigClient');
const storageService = require('../../services/storageService');
const difyClient = require('../../clients/dynamicDifyClient');
const parseTranscription = require('./transcriptionParser');
const { TARGET_CONFIG, resolveSttAudio } = require('./sttAudioResolver');
const ScoringError = require('./scoringError');

async function transcribeAnswer(input, dependencies = {}) {
  const submissions = dependencies.submissions || submissionRepository;
  const evaluations = dependencies.evaluations || evaluationRepository;
  const chooseAgent = dependencies.selectAgent || selectAgent;
  const dify = dependencies.dify || difyClient;
  const now = dependencies.now || (() => new Date());
  const targetType = input.targetType || 'student_answer';

  if (!input.answerId) throw new ScoringError('answerId is required.', 400);
  if (!TARGET_CONFIG[targetType]) {
    throw new ScoringError(`Target transcription không hợp lệ: ${targetType}`, 400);
  }

  const answer = await submissions.findAnswerById(input.answerId);
  if (!answer) throw new ScoringError('Không tìm thấy câu trả lời.', 404);
  const agent = await chooseAgent({
    agentId: input.agentId,
    apiType: 'STT',
    sttTarget: targetType,
    answer
  });
  if (!agent) {
    throw new ScoringError(`Không tìm thấy Agent cấu hình Transcribe tương ứng cho ${targetType}.`, 404);
  }

  const requestSentAt = now();
  const audioUrl = await resolveSttAudio({ answer, targetType, publicUrl: input.publicUrl }, {
    evaluations,
    tokens: dependencies.tokens || tokenManager,
    iig: dependencies.iig || iigClient,
    storage: dependencies.storage || storageService
  });
  const fileKey = targetType === 'question' ? 'audio_question'
    : targetType === 'context' ? 'audio_context' : 'student_audio';
  const result = await dify.transcribeSpeech(
    agent.api_endpoint,
    agent.api_key,
    audioUrl,
    fileKey,
    answer.prompt_text || ''
  );
  const responseReceivedAt = now();
  const transcription = parseTranscription(result.data?.outputs || {});

  if (targetType === 'student_answer') {
    await evaluations.upsertTranscription({
      answerId: input.answerId,
      requestSentAt,
      responseReceivedAt,
      transcribe: transcription
    });
  } else if (targetType === 'question') {
    await submissions.updateQuestionName(input.answerId, transcription);
  } else {
    await submissions.updateContextText(input.answerId, transcription);
  }

  return { answerId: input.answerId, targetType, transcribe: transcription };
}

module.exports = transcribeAnswer;

