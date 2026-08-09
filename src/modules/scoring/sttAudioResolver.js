const ScoringError = require('./scoringError');

const TARGET_CONFIG = Object.freeze({
  student_answer: { field: 'student_audio_file_id', missing: 'Câu trả lời thiếu file ghi âm.' },
  question: { field: 'question_audio_file_id', missing: 'Câu hỏi thiếu file ghi âm.' },
  context: { field: 'context_audio_file_id', missing: 'Bối cảnh thiếu file ghi âm.' }
});

async function resolveSttAudio({ answer, targetType, publicUrl }, dependencies) {
  const { evaluations, tokens, iig, storage } = dependencies;
  const config = TARGET_CONFIG[targetType];
  if (!config) throw new ScoringError(`Target transcription không hợp lệ: ${targetType}`, 400);

  if (targetType === 'student_answer') {
    const audioState = await evaluations.findAudioState(answer.id);
    let cleanedUrl = audioState?.cleaned_audio_url;
    if (cleanedUrl && storage.isR2Key(cleanedUrl)) {
      try {
        cleanedUrl = await storage.getSignedAudioUrl(cleanedUrl);
      } catch (error) {
        cleanedUrl = null;
      }
    }
    if (cleanedUrl && /(localhost|127\.0\.0\.1)/.test(cleanedUrl)) {
      cleanedUrl = publicUrl
        ? cleanedUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/, publicUrl)
        : null;
    }
    if (cleanedUrl) return cleanedUrl;
  }

  const fileId = answer[config.field];
  if (!fileId) throw new ScoringError(config.missing, 400);
  const token = await tokens.ensureFreshToken();
  const url = await iig.getMigratedFileUrl(fileId, token);
  if (!url) throw new ScoringError('Không thể giải quyết URL tệp ghi âm.', 404);
  return url;
}

module.exports = { TARGET_CONFIG, resolveSttAudio };

