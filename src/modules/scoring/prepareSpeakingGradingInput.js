const submissionRepository = require('../submissions/submissionRepository');
const evaluationRepository = require('./evaluationRepository');
const { resolveAnswerQuestionType } = require('./questionType');
const { findMatchingAgent } = require('./agentSelector');
const tokenManager = require('../../services/tokenManager');
const iigClient = require('../../clients/iigClient');
const storageService = require('../../services/storageService');
const difyClient = require('../../clients/dynamicDifyClient');
const parseTranscription = require('./transcriptionParser');

const SILENT_AUDIO_URL = 'https://github.com/anars/blank-audio/raw/master/1-second-of-silence.mp3';

async function resolveStudentAudio(answer, audioState, dependencies, publicUrl) {
  const { storage, tokens, iig } = dependencies;
  let audioUrl = audioState?.cleaned_audio_url || null;
  if (audioUrl && storage.isR2Key(audioUrl)) {
    try {
      audioUrl = await storage.getSignedAudioUrl(audioUrl);
    } catch (error) {
      audioUrl = null;
    }
  }
  if (audioUrl && /(localhost|127\.0\.0\.1)/.test(audioUrl)) {
    audioUrl = publicUrl
      ? audioUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/, publicUrl)
      : null;
  }
  if (!audioUrl && answer.student_audio_file_id) {
    try {
      const token = await tokens.ensureFreshToken();
      audioUrl = await iig.getMigratedFileUrl(answer.student_audio_file_id, token);
    } catch (error) {
      audioUrl = null;
    }
  }
  return audioUrl || SILENT_AUDIO_URL;
}

async function transcribeSupportingAudio({ answer, targetType, questionType }, dependencies) {
  const config = targetType === 'context'
    ? { fileId: answer.context_audio_file_id, current: answer.context_text, fileKey: 'audio_context' }
    : { fileId: answer.question_audio_file_id, current: answer.question_name, fileKey: 'audio_question' };
  if (!config.fileId || String(config.current || '').trim()) return config.current || '';

  const agent = await dependencies.findAgent({ apiType: 'STT', sttTarget: targetType, questionType });
  if (!agent) return config.current || '';
  try {
    const token = await dependencies.tokens.ensureFreshToken();
    const url = await dependencies.iig.getMigratedFileUrl(config.fileId, token);
    if (!url) return config.current || '';
    const result = await dependencies.dify.transcribeSpeech(
      agent.api_endpoint, agent.api_key, url, config.fileKey, ''
    );
    return parseTranscription(result.data?.outputs || {});
  } catch (error) {
    console.error(`[Grading] Auto-${targetType}-STT failed:`, error.message);
    return config.current || '';
  }
}

async function prepareSpeakingGradingInput(answer, options = {}, injected = {}) {
  const dependencies = {
    submissions: injected.submissions || submissionRepository,
    evaluations: injected.evaluations || evaluationRepository,
    findAgent: injected.findAgent || findMatchingAgent,
    tokens: injected.tokens || tokenManager,
    iig: injected.iig || iigClient,
    storage: injected.storage || storageService,
    dify: injected.dify || difyClient
  };
  const audioState = await dependencies.evaluations.findAudioState(answer.id);
  const audioUrl = await resolveStudentAudio(answer, audioState, dependencies, options.publicUrl);
  const questionType = resolveAnswerQuestionType(answer);

  const contextText = await transcribeSupportingAudio({ answer, targetType: 'context', questionType }, dependencies);
  if (contextText && contextText !== answer.context_text) {
    answer.context_text = contextText;
    await dependencies.submissions.updateContextText(answer.id, contextText);
  }

  const questionName = await transcribeSupportingAudio({ answer, targetType: 'question', questionType }, dependencies);
  if (questionName && questionName !== answer.question_name) {
    answer.question_name = questionName;
    await dependencies.submissions.updateQuestionName(answer.id, questionName);
  }

  let transcription = audioState?.transcribe || '';
  if (!transcription.trim()) {
    const agent = await dependencies.findAgent({
      apiType: 'STT', sttTarget: 'student_answer', questionType
    });
    if (agent) {
      try {
        const result = await dependencies.dify.evaluateSpeech(
          agent.api_endpoint, agent.api_key, audioUrl, answer.prompt_text || ''
        );
        transcription = parseTranscription(result.data?.outputs || {});
        if (transcription) {
          await dependencies.evaluations.upsertTranscription({
            answerId: answer.id,
            transcribe: transcription
          });
        }
      } catch (error) {
        console.error('[Grading] Auto student-answer STT failed:', error.message);
      }
    }
  }

  return {
    audioUrl,
    transcription,
    contextText: answer.context_text || '',
    questionName: answer.question_name || answer.prompt_text || ''
  };
}

module.exports = { SILENT_AUDIO_URL, resolveStudentAudio, prepareSpeakingGradingInput };

