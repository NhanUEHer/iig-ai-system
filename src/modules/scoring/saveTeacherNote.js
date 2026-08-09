const evaluationRepository = require('./evaluationRepository');
const ScoringError = require('./scoringError');

async function saveTeacherNote({ answerId, teacherNote }, dependencies = {}) {
  if (!answerId) throw new ScoringError('answer_id is required.', 400);
  const repository = dependencies.evaluationRepository || evaluationRepository;
  await repository.upsertTeacherNote(answerId, teacherNote);
  return { answerId, teacherNote: teacherNote || null };
}

module.exports = saveTeacherNote;

