const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDifyInputs,
} = require('../src/clients/iigDescribePictureGroupDifyClient');
const {
  parseDescribePictureGroupResult,
} = require('../src/modules/iig-ai-scoring/describePictureGroupResultParser');
const groupWorker = require('../src/modules/iig-ai-scoring/describePictureGroupScoringWorker');

function score(finalScore) {
  return {
    pronunciationScore: finalScore,
    intonationFluencyScore: finalScore,
    grammarScore: finalScore,
    vocabularyScore: finalScore,
    cohesionScore: finalScore,
    finalScore,
  };
}

test('maps locked Q3/Q4 component scores to the isolated group contract', () => {
  const mapped = buildDifyInputs({
    jobId: 'run-1', keycode: 'ABC123',
    questionScores: { s_q3: score(2), s_q4: score(3) },
  });
  assert.equal(mapped.group_code, 'DESCRIBE_PICTURE');
  const questions = JSON.parse(mapped.questions_json);
  assert.deepEqual(questions.map(item => item.question_id), ['s_q3', 's_q4']);
  assert.equal(questions[0].grammar_score, 2);
});

test('parses one Q3/Q4 group result', () => {
  const result = parseDescribePictureGroupResult({
    schema_version: 'describe-picture-group-result-v1',
    group_code: 'DESCRIBE_PICTURE',
    group_final_score: 2,
    versions: { group_prompt: 'describe-picture-group-prompt-v2' },
  });
  assert.equal(result.groupFinalScore, 2);
});

test('group worker sends only locked Q3/Q4 scores and persists the Dify decision', async () => {
  let completedArgs = null;
  const repository = {
    loadTask: async () => ({
      runId: 'run-1', groupResultId: 'group-1', aggregationVersion: 'describe-picture-q3-q4-group-llm-v1',
      keycode: 'ABC123', questionScores: { s_q3: score(2), s_q4: score(3) },
    }),
    startTask: async () => ({ started: true, modelExecutionId: 'execution-1' }),
    completeTask: async args => { completedArgs = args; return { completed: true }; },
    markRetry: async () => assert.fail('must not retry'),
    markDeadLetter: async () => assert.fail('must not dead-letter'),
  };
  const result = await groupWorker.processEvent({
    id: 'event-1', runId: 'run-1', publishAttempts: 1, lockedBy: 'worker-1', payload: {},
  }, {
    repository, endpoint: 'https://dify.example/v1', apiKey: 'secret',
    client: { score: async args => {
      assert.deepEqual(Object.keys(args.input).sort(), ['jobId', 'keycode', 'questionScores']);
      return {
        providerRunId: 'wf-1', workflowStatus: 'succeeded', usage: {},
        result: { groupFinalScore: 2, schemaVersion: 'describe-picture-group-result-v1' },
      };
    } },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.groupFinalScore, 2);
  assert.equal(completedArgs.providerResult.result.groupFinalScore, 2);
});

test('group repositories are isolated by aggregation prefix', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const describe = fs.readFileSync(path.join(__dirname, '../src/modules/iig-ai-scoring/describePictureGroupScoringRepository.js'), 'utf8');
  const rta = fs.readFileSync(path.join(__dirname, '../src/modules/iig-ai-scoring/rtaGroupScoringRepository.js'), 'utf8');
  assert.match(describe, /describe-picture-q3-q4-/);
  assert.match(rta, /rta-q1-q2-/);
});
