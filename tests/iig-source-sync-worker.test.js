const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  canonicalizeSourcePayload,
  imageUrls,
  scorerTypeForQuestion,
} = require('../src/modules/iig-ingestion/sourceCanonicalizer');
const worker = require('../src/modules/iig-ingestion/sourceSyncWorker');

const jobId = 'b3ec3a90-e447-4f88-b2e2-99ead7f32468';
const event = {
  id: '8a11ff0e-fb67-4dda-a4bc-adf3582f49bf',
  jobId,
  publishAttempts: 1,
  lockedBy: 'worker-1',
  payload: { snapshotHash: 'a'.repeat(64) },
};

function sourcePayload(overrides = {}) {
  return {
    mockTestScoringInfo: {
      id: '01a10cbe-5139-7096-a3fa-705a31b65d0f',
      mockTestId: 'mock-test-1',
      mockTestName: 'TOEIC SW',
      keyCode: 'NHY2WZXS',
      webUserName: 'Candidate',
      status: 1,
      submittedDate: '2026-10-05T15:46:01Z',
    },
    groupScorings: [{
      scoreScaleGroupId: 'group-speaking',
      scoreScaleGroupName: 'Read text aloud',
      mocktestSectionId: 'section-speaking',
      fromQuestion: 1,
      toQuestion: 1,
      fromScore: 0,
      toScore: 3,
      sortOrder: 1,
    }],
    questions: [{
      questionChooseId: 'choose-1',
      questionId: 'question-1',
      questionnaireId: 'questionnaire-1',
      questionnaireType: 14,
      questionnaireInfo: {
        id: 'questionnaire-1',
        name: 'Question 01',
        questionReadTexts: [{
          id: 'question-1',
          content: '',
          fixedPreparationTime: 10,
          recordingTime: '00:00:45',
        }],
        leftSections: [{
          title: 'Read the text aloud.',
          textContent: '<h4>Hello world.</h4><img src="https://assets.example.test/a.png?signature=secret">',
        }],
      },
      studentAnswerText: 'student-file-1',
      studentRecordFileId: 'student-file-1',
    }],
    ...overrides,
  };
}

test('canonicalizer separates reusable exam content from candidate answers', () => {
  const first = canonicalizeSourcePayload(sourcePayload());
  const replay = sourcePayload();
  replay.questions[0].questionChooseId = 'different-choose';
  replay.questions[0].studentAnswerText = 'student-file-2';
  replay.questions[0].studentRecordFileId = 'student-file-2';
  replay.mockTestScoringInfo.webUserName = 'Another Candidate';
  const second = canonicalizeSourcePayload(replay);

  assert.equal(first.exam.structureHash, second.exam.structureHash);
  assert.equal(first.sections[0].sectionType, 'SPEAKING');
  assert.equal(first.questions[0].questionNumber, 1);
  assert.equal(first.questions[0].scorerType, 'READ_TEXT_ALOUD');
  assert.equal(first.questions[0].contextText, 'Hello world.');
  assert.equal(first.questions[0].studentAudioFileId, 'student-file-1');
  assert.equal(first.questions[0].answerText, null);
  assert.deepEqual(first.questions[0].assets[0], {
    role: 'CONTEXT_IMAGE',
    index: 0,
    isRequired: true,
    sourceFileId: null,
    url: 'https://assets.example.test/a.png',
  });
});

test('canonicalizer changes the exam version hash when scoring content changes', () => {
  const first = canonicalizeSourcePayload(sourcePayload());
  const changed = sourcePayload();
  changed.questions[0].questionnaireInfo.leftSections[0].textContent = '<h4>Changed passage.</h4>';
  const second = canonicalizeSourcePayload(changed);
  assert.notEqual(first.exam.structureHash, second.exam.structureHash);
  assert.notEqual(first.questions[0].contentHash, second.questions[0].contentHash);
});

test('canonicalizer uses the supplied context transcript instead of image-only HTML', () => {
  const payload = sourcePayload();
  payload.questions[0].questionnaireInfo.leftSections[0] = {
    title: 'Questions 8 through 10 refer to the following information.',
    textContent: '<img src="https://assets.example.test/cooking-class.png?signature=secret">',
    textScript: 'W: Hello. I am considering enrolling my daughter in one of your cooking classes.',
    audioFileId: 'context-audio-1',
  };

  const canonical = canonicalizeSourcePayload(payload);

  assert.equal(
    canonical.questions[0].contextText,
    'W: Hello. I am considering enrolling my daughter in one of your cooking classes.'
  );
  assert.equal(canonical.questions[0].promptHtml, payload.questions[0].questionnaireInfo.leftSections[0].textContent);
  assert.deepEqual(
    canonical.questions[0].assets.map(asset => asset.role),
    ['CONTEXT_AUDIO', 'CONTEXT_IMAGE']
  );
});

test('canonicalizer changes the exam version hash when a context transcript changes', () => {
  const firstPayload = sourcePayload();
  firstPayload.questions[0].questionnaireInfo.leftSections[0].textScript = 'Original context transcript.';
  const changedPayload = sourcePayload();
  changedPayload.questions[0].questionnaireInfo.leftSections[0].textScript = 'Updated context transcript.';

  const first = canonicalizeSourcePayload(firstPayload);
  const changed = canonicalizeSourcePayload(changedPayload);

  assert.notEqual(first.exam.structureHash, changed.exam.structureHash);
  assert.notEqual(first.questions[0].contentHash, changed.questions[0].contentHash);
});

test('canonicalizer removes signed URL parameters from discovered image locators', () => {
  assert.deepEqual(
    imageUrls('<img src="https://example.test/image.jpg?X-Amz-Signature=secret#fragment">'),
    ['https://example.test/image.jpg']
  );
});

test('canonicalizer derives TOEIC scorer type from section question number, not a shared score-group label', () => {
  assert.equal(scorerTypeForQuestion('Respond to Questions', 13, 7), 'RESPOND_TO_QUESTIONS');
  assert.equal(scorerTypeForQuestion('Respond to Questions', 13, 8), 'RESPOND_USING_INFORMATION');
  assert.equal(scorerTypeForQuestion('Respond to Questions', 13, 10), 'RESPOND_USING_INFORMATION');
  assert.equal(scorerTypeForQuestion('Read text aloud', 14, 2), 'READ_TEXT_ALOUD');
  assert.equal(scorerTypeForQuestion('Writing', 15, 6), 'RESPOND_TO_WRITTEN_REQUEST');
  assert.equal(scorerTypeForQuestion('Writing', 15, 8), 'WRITE_OPINION_ESSAY');
});

test('source sync worker canonicalizes a stored snapshot and persists it', async () => {
  let persisted;
  const result = await worker.processEvent(event, {
    repository: {
      loadSnapshot: async () => sourcePayload(),
      completeSync: async input => {
        persisted = input.canonical;
        return { submissionId: 'submission-1', examVersionId: 'version-1', mediaCount: 2 };
      },
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async () => assert.fail('must not dead-letter'),
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.questionCount, 1);
  assert.equal(persisted.exam.sourceMockTestId, 'mock-test-1');
});

test('source sync worker dead-letters a missing snapshot', async () => {
  let deadLetter;
  const result = await worker.processEvent(event, {
    repository: {
      loadSnapshot: async () => null,
      completeSync: async () => assert.fail('must not persist'),
      markRetry: async () => assert.fail('must not retry'),
      markDeadLetter: async input => { deadLetter = input; },
    },
  });
  assert.equal(result.status, 'dead_letter');
  assert.equal(deadLetter.error.code, 'IIG_SOURCE_SNAPSHOT_MISSING');
});

test('source sync worker retries transient persistence errors', async () => {
  let retry;
  const result = await worker.processEvent(event, {
    repository: {
      loadSnapshot: async () => sourcePayload(),
      completeSync: async () => { throw new Error('database unavailable'); },
      markRetry: async input => { retry = input; },
      markDeadLetter: async () => assert.fail('must not dead-letter first transient failure'),
    },
    maxAttempts: 5,
  });
  assert.equal(result.status, 'retry');
  assert.equal(retry.delayMs, 5000);
});

test('sync repository locks catalog versions and emits media work atomically', () => {
  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(
    path.join(root, 'src/modules/iig-ingestion/sourceSyncRepository.js'),
    'utf8'
  );
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /iig_exam_catalog[\s\S]*FOR UPDATE/);
  assert.match(repository, /MEDIA_PREPARATION_REQUESTED/);
  assert.match(repository, /INPUT_VALIDATION_REQUESTED/);
  assert.match(repository, /SOURCE_SYNC_COMPLETED/);
  assert.match(server, /iigSourceSyncWorker\.startWorker/);
  assert.match(server, /iigSourceSyncWorker\.stopWorker/);
});
