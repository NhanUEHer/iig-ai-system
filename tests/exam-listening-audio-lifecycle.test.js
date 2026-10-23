const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../exam-web/src/pages/ExamTestPage.jsx'), 'utf8');

test('selecting an answer does not recreate the listening audio callback', () => {
  assert.match(source, /const questionGroupId = questionGroup\?\.id \|\| null/);
  assert.match(source, /const questionAudioUrl = questionGroup\?\.content\?\.audioUrl \|\| ''/);
  assert.match(source, /\}, \[advanceQuestion, answerDurationSeconds, hasNextQuestionGroup, isToeflListening, playAudioToEnd, questionAudioDurationSeconds, questionAudioUrl, questionBreakDurationSeconds, stopAudio\]\)/);
  assert.match(source, /\[phase, questionGroupId, playQuestionAudio, requiresAudio, stopAudio\]/);

  const audioCallback = source.slice(
    source.indexOf('const playQuestionAudio'),
    source.indexOf('const openFreestyleGroup'),
  );
  assert.doesNotMatch(audioCallback, /\[advanceQuestion, questionGroup, stopAudio\]/);
});

test('listening flow reuses one audio player and guards stalled playback', () => {
  assert.match(source, /if \(!audio\) \{\s*audio = new Audio\(\)/);
  assert.match(source, /audioRef\.current = audio/);
  assert.match(source, /AudioTimeoutError/);
  assert.match(source, /window\.setTimeout\(timeout, 20 \* 1000\)/);
  assert.doesNotMatch(source, /for \(let attempt = 0; attempt < 3/);
});

test('listening only waits between groups and lets legacy parts skip missing introduction audio', () => {
  assert.match(source, /shouldPauseBetweenListeningGroups\(\{/);
  assert.match(source, /setToeflListeningPhase\('break'\)/);
  assert.match(source, /await wait\(questionBreakDurationSeconds \* 1000\)/);
  assert.match(source, /isToeflListening && toeflListeningPhase !== 'answer' \? null/);
  assert.match(source, /if \(hasNextQuestionGroup && questionBreakDurationSeconds > 0\)/);
  assert.match(source, /audioState === 'missing'.*Tiếp tục vào Part/);
  assert.match(source, /audioState === 'error'.*Tiếp tục vào Part/);
});

test('restoring a Listening position keeps the loader callback stable while the active Part changes', () => {
  assert.match(source, /const loadQuestionGroup = useCallback\(async \(groups, index, partId, listeningMode\)/);
  assert.match(source, /setLocked\(listeningMode\)[\s\S]*?\}, \[examId, session\]\)/);
  assert.match(source, /targetIsToeflListening[\s\S]*?loadQuestionGroup\(groups, targetGroupIndex, position\.partId, targetIsToeflListening\)/);
});
