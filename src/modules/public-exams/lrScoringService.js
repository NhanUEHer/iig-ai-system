const HttpError = require('../../http/httpError');

const SCORING_VERSION = 'LR_RAW_CORRECT_V1';
const LR_MODES = new Set(['NON_STOP', 'FREESTYLE']);
const number = value => Number(value || 0);

function scoringError(message, code) { return new HttpError(message, 409, code); }

function evaluate({ grading, answers = [], recordingIds = [] }) {
  const answerMap = new Map(answers.map(answer => [answer.subQuestionId, answer]));
  const recorded = new Set(recordingIds);
  const sections = Object.values(grading.sections || {}).filter(section => LR_MODES.has(section.examMode));
  const lrSectionIds = new Set(sections.map(section => section.id));
  const items = Object.values(grading.questions || {}).map(question => {
    const answer = answerMap.get(question.subQuestionId);
    const selectedOption = answer?.selectedOptionKey || null;
    const isLr = lrSectionIds.has(question.sectionId);
    if (isLr && (!question.correctOptionKey || number(question.correctOptionCount) !== 1)) {
      throw scoringError('Câu hỏi trong snapshot không có đúng một đáp án đúng.', 'SCORING_CORRECT_OPTION_INVALID');
    }
    const answered = Boolean(selectedOption) || recorded.has(question.subQuestionId);
    // Keep unanswered questions distinct from incorrect answers in PostgreSQL.
    // Aggregate incorrectCount only includes questions the candidate answered.
    const isCorrect = isLr && Boolean(selectedOption) ? selectedOption === question.correctOptionKey : null;
    return {
      ...question,
      selectedOption,
      flagged: answer?.flagged === true,
      savedAt: answer?.savedAt || null,
      answered,
      isCorrect,
      score: isCorrect === null ? null : (isCorrect ? 1 : 0),
    };
  });

  const sectionResults = sections.map(section => {
    const scale = section.scoreScale;
    if (!scale) throw scoringError(`Phần thi “${section.title}” chưa có thang điểm trong snapshot.`, 'SCORING_SCALE_MISSING');
    if (scale.scaleType !== 'LR_RAW_CORRECT' || scale.status !== 'ACTIVE') {
      throw scoringError(`Thang điểm của phần thi “${section.title}” không hợp lệ.`, 'SCORING_SCALE_INVALID');
    }
    const sectionItems = items.filter(item => item.sectionId === section.id);
    if (number(scale.questionCount) !== sectionItems.length || number(section.questionCount) !== sectionItems.length) {
      throw scoringError(`Số câu của thang điểm không khớp phần thi “${section.title}”.`, 'SCORING_SCALE_QUESTION_COUNT_MISMATCH');
    }
    const answeredCount = sectionItems.filter(item => item.answered).length;
    const correctCount = sectionItems.filter(item => item.isCorrect === true).length;
    const incorrectCount = answeredCount - correctCount;
    const mapping = (scale.rawRanges || []).find(row => number(row.correctCount) === correctCount);
    if (!mapping) throw scoringError(`Thang điểm thiếu mapping cho ${correctCount} câu đúng.`, 'SCORING_SCALE_MAPPING_MISSING');
    const exactScore = number(mapping.convertedScore);
    const rangeMax = Math.min(exactScore + number(scale.scoreStep), number(scale.maxScore));
    return {
      sectionId: section.id,
      sectionTitle: section.title,
      examMode: section.examMode,
      scoreScaleId: scale.id,
      scoreScaleCode: scale.code,
      scoreScaleVersion: number(scale.version) || 1,
      totalQuestions: sectionItems.length,
      answeredCount,
      unansweredCount: sectionItems.length - answeredCount,
      correctCount,
      incorrectCount,
      exactScore,
      scoreRangeMin: exactScore,
      scoreRangeMax: rangeMax,
      minPossibleScore: number(scale.minScore),
      maxPossibleScore: number(scale.maxScore),
      scoringSnapshot: scale,
    };
  });

  const lrItems = items.filter(item => lrSectionIds.has(item.sectionId));
  const answeredCount = lrItems.filter(item => item.answered).length;
  const correctCount = lrItems.filter(item => item.isCorrect === true).length;
  const totalScore = sectionResults.reduce((sum, section) => sum + section.exactScore, 0);
  const scoreRangeMin = sectionResults.reduce((sum, section) => sum + section.scoreRangeMin, 0);
  const scoreRangeMax = sectionResults.reduce((sum, section) => sum + section.scoreRangeMax, 0);
  const maxScore = sectionResults.reduce((sum, section) => sum + section.maxPossibleScore, 0);
  const partMap = new Map();
  for (const item of lrItems) {
    const part = partMap.get(item.partId) || {
      id: item.partId,
      title: item.partTitle,
      sectionId: item.sectionId,
      totalQuestions: 0,
      answeredCount: 0,
      correctCount: 0,
      incorrectCount: 0,
    };
    part.totalQuestions += 1;
    part.answeredCount += item.answered ? 1 : 0;
    part.correctCount += item.isCorrect ? 1 : 0;
    part.incorrectCount = part.answeredCount - part.correctCount;
    partMap.set(item.partId, part);
  }
  return {
    scoringVersion: SCORING_VERSION,
    items,
    sectionResults,
    partBreakdown: [...partMap.values()].map(part => ({
      ...part,
      unansweredCount: part.totalQuestions - part.answeredCount,
      accuracyPercent: part.answeredCount > 0 ? Math.round((part.correctCount / part.answeredCount) * 1000) / 10 : 0,
    })),
    totalQuestions: lrItems.length,
    answeredCount,
    unansweredCount: lrItems.length - answeredCount,
    correctCount,
    incorrectCount: answeredCount - correctCount,
    totalScore,
    scoreRangeMin,
    scoreRangeMax,
    maxScore,
  };
}

module.exports = { evaluate, SCORING_VERSION };
