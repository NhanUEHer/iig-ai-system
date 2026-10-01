// Dynamic duration calculator (spec §17–§21). Every value here is computed at
// read/validate time from backend source data and is NEVER persisted. Only
// Listening (NON_STOP) and Speaking (RECORD_NON_STOP) produce calculated
// durations. Writing uses the configured working time of each Part.

const { TIMED_MODES } = require('./examConstants');

const toSeconds = value => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Listening MCQ parent question = content audio duration.
// Speaking Record parent question = content audio + sum(sub audio + prep + recording).
// `source` shape: { contentAudioSeconds, subAudioSeconds, preparationSeconds, recordingSeconds }.
function questionActualDuration(mode, source = {}) {
  const contentAudio = toSeconds(source.contentAudioSeconds);
  if (mode === 'NON_STOP') return contentAudio;
  if (mode === 'RECORD_NON_STOP') {
    return contentAudio + toSeconds(source.subAudioSeconds) + toSeconds(source.preparationSeconds) + toSeconds(source.recordingSeconds);
  }
  return null;
}

// Part actual duration = instruction audio (once) + sum(question durations)
// + max(parentCount - 1, 0) * breakDuration. Breaks only apply between parent
// questions, never after the last one and never between sub-questions.
function partActualDuration(mode, { instructionAudioSeconds = 0, questionDurations = [], breakDurationSeconds = 0, configuredDurationSeconds = 0 } = {}) {
  if (mode === 'WRITING_NON_STOP') return toSeconds(configuredDurationSeconds);
  if (!TIMED_MODES.has(mode)) return null;
  const questionsTotal = questionDurations.reduce((sum, value) => sum + toSeconds(value), 0);
  const parentCount = questionDurations.length;
  const breakCount = Math.max(parentCount - 1, 0);
  return Math.round(toSeconds(instructionAudioSeconds) + questionsTotal + breakCount * toSeconds(breakDurationSeconds));
}

// Section actual duration = sum of its parts' actual durations (timed modes only).
function sectionActualDuration(mode, partDurations = []) {
  if (!TIMED_MODES.has(mode) && mode !== 'WRITING_NON_STOP') return null;
  return partDurations.reduce((sum, value) => sum + toSeconds(value), 0);
}

// Exam configured total = sum of section configured durations.
function examConfiguredDuration(sections = []) {
  return sections.reduce((sum, section) => sum + toSeconds(section.configuredDurationSeconds), 0);
}

// Exam actual total = sum of section actual durations that have a value (timed).
function examActualDuration(sectionActuals = []) {
  return sectionActuals.filter(value => value !== null && value !== undefined).reduce((sum, value) => sum + toSeconds(value), 0);
}

// Configured/actual/difference triple for a timed unit. Difference is
// informational only (positive means actual exceeds configured).
function durationComparison(configuredSeconds, actualSeconds) {
  if (actualSeconds === null || actualSeconds === undefined) {
    return { configuredDurationSeconds: toSeconds(configuredSeconds), actualDurationSeconds: null, durationDifferenceSeconds: null };
  }
  const configured = toSeconds(configuredSeconds);
  return { configuredDurationSeconds: configured, actualDurationSeconds: actualSeconds, durationDifferenceSeconds: actualSeconds - configured };
}

module.exports = {
  questionActualDuration,
  partActualDuration,
  sectionActualDuration,
  examConfiguredDuration,
  examActualDuration,
  durationComparison,
};
