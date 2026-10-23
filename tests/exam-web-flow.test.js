const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const flowModule = import(pathToFileURL(path.join(__dirname, '../exam-web/src/services/examFlow.js')).href);

test('TOEFL Reading can transition from its final freestyle Part to Listening', async () => {
  const { getNextFreestyleTransitionIndex } = await flowModule;
  const parts = [
    { id: 'reading', sectionId: 'reading-section', examMode: 'FREESTYLE' },
    { id: 'listening', sectionId: 'listening-section', examMode: 'NON_STOP' },
  ];
  assert.equal(getNextFreestyleTransitionIndex(parts, 0, true), 1);
  assert.equal(getNextFreestyleTransitionIndex(parts, 1, true), -1);
});

test('legacy TOEIC freestyle navigation remains inside the current section', async () => {
  const { getNextFreestyleTransitionIndex } = await flowModule;
  const parts = [
    { id: 'reading-1', sectionId: 'reading-section', examMode: 'FREESTYLE' },
    { id: 'reading-2', sectionId: 'reading-section', examMode: 'FREESTYLE' },
    { id: 'listening', sectionId: 'listening-section', examMode: 'NON_STOP' },
  ];
  assert.equal(getNextFreestyleTransitionIndex(parts, 0, false), 1);
  assert.equal(getNextFreestyleTransitionIndex(parts, 1, false), -1);
});

test('TOEFL Listening pauses only between parent question groups', async () => {
  const { shouldPauseBetweenListeningGroups } = await flowModule;
  const base = { isToeflListening: true, hasNextQuestionGroup: true, isLastSubQuestion: true, breakDurationSeconds: 3 };
  assert.equal(shouldPauseBetweenListeningGroups(base), true);
  assert.equal(shouldPauseBetweenListeningGroups({ ...base, isLastSubQuestion: false }), false);
  assert.equal(shouldPauseBetweenListeningGroups({ ...base, hasNextQuestionGroup: false }), false);
  assert.equal(shouldPauseBetweenListeningGroups({ ...base, breakDurationSeconds: 0 }), false);
  assert.equal(shouldPauseBetweenListeningGroups({ ...base, isToeflListening: false }), false);
});
