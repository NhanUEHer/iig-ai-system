#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

require('dotenv').config({ path: ['.env.r2.local', '.env'], override: true, quiet: true });

const azureClient = require('../src/clients/azureRtaAssessmentClient');
const { cleanText, ZERO_UUID } = require('../src/modules/iig-ingestion/sourceCanonicalizer');
const { extractFeatures } = require('../src/modules/iig-ai-scoring/featureExtractor');
const { buildReadAloudEvidenceRequest, normalizeReadAloudSpeechEvidence } = require('../src/modules/iig-ai-scoring/readAloudEvidenceContract');
const { normalizeAzureEvidence } = require('../src/modules/iig-ai-scoring/azureRtaEvidenceProvider');
const { mergeEvidence } = require('../src/modules/iig-ai-scoring/evidenceResultMerger');
const { buildRtaMlFeatures, RTA_ML_FEATURE_NAMES } = require('../src/modules/iig-ai-scoring/rtaMlFeatureBuilder');

const execFileAsync = promisify(execFile);
const LIST_URL = 'https://elearning-admin.iigvn.com/api/admin-proxy/mocktest-scorings/list';
const BATCH_URL = 'https://elearning-admin.iigvn.com/api/admin-proxy/mocktest-scorings/batch-detail';
const FILE_URL = 'https://elearningapi.iigvietnam.com/file/api/file-upload';
const FEATURE_VERSION = 'iig-ai-evidence-v2';

function option(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function integerOption(name, fallback, minimum = 1) {
  const parsed = Number.parseInt(option(name, ''), 10);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function required(value, message) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await fsp.rename(temporaryPath, filePath);
}

function parseCookieFromCurl(requestPath) {
  const source = fs.readFileSync(requestPath, 'utf8');
  const cookie = source.match(/\n\s*-b '([^']+)'/)?.[1];
  return required(cookie, 'The curl file does not contain a -b session cookie.');
}

async function jsonRequest(url, { cookie, body, timeoutMs = 120000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function technicalListItem(item) {
  return {
    scoringId: String(item.id || ''),
    keycode: String(item.keyCode || '').trim().toUpperCase(),
    mockTestName: item.mockTestName || null,
    submittedDate: item.submittedDate || null,
    scoredDate: item.scoredDate || null,
    status: item.status,
    score: item.score ?? null,
    scoreDisplay: item.scoreDisplay ?? null,
  };
}

async function listScoredSubmissions({ cookie, limit, pageSize }) {
  const output = [];
  let pageNumber = 1;
  let totalCount = null;
  while (output.length < limit) {
    const payload = await jsonRequest(LIST_URL, {
      cookie,
      body: {
        PageNumber: pageNumber,
        PageSize: Math.min(pageSize, limit - output.length),
        Statuses: [5],
        MockTestIds: [],
        CourseIds: [],
        AssigneeUserIds: [],
      },
    });
    const page = (payload?.data ?? payload)?.pagedData;
    if (!page || !Array.isArray(page.items)) throw new Error('IIG list response has no pagedData.items.');
    totalCount = Number(page.totalCount || page.items.length);
    output.push(...page.items.map(technicalListItem));
    if (!page.hasNextPage || !page.items.length) break;
    pageNumber += 1;
  }
  const unique = [];
  const seen = new Set();
  for (const item of output) {
    if (!item.scoringId || seen.has(item.scoringId)) continue;
    seen.add(item.scoringId);
    unique.push(item);
  }
  return {
    totalCount,
    duplicateCount: output.length - unique.length,
    items: unique.slice(0, limit),
  };
}

function rtaGroup(payload) {
  return (payload.groupScorings || []).find(group => (
    Number(group.fromQuestion) === 1
    && Number(group.toQuestion) === 2
    && Number(group.toScore) === 3
  )) || (payload.groupScorings || []).find(group => (
    String(group.scoreScaleGroupName || '').toLowerCase().includes('read text aloud')
  ));
}

function filteredSource(payload) {
  const info = payload.mockTestScoringInfo || {};
  const group = rtaGroup(payload);
  if (!group || !Number.isFinite(Number(group.selectedScore))) {
    throw new Error('The submission has no final Read Text Aloud group score.');
  }
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = rawQuestions
    .slice(Number(group.fromQuestion) - 1, Number(group.toQuestion))
    .map((question, index) => {
      const questionnaire = question.questionnaireInfo || {};
      const questionnaireType = Number(question.questionnaireType);
      if (![13, 14].includes(questionnaireType)) {
        throw new Error(`RTA question ${index + 1} has unsupported questionnaire type ${questionnaireType}.`);
      }
      const passage = (questionnaire.leftSections || [])
        .map(section => cleanText(section?.textScript) || cleanText(section?.textContent))
        .filter(Boolean)
        .join('\n');
      const questionId = String(question.questionId || '').trim();
      if (!questionId || !passage) throw new Error(`RTA question ${index + 1} is missing question ID or passage.`);
      const audioFileId = String(question.studentRecordFileId || '').trim();
      return {
        questionNumber: index + 1,
        questionId,
        questionChooseId: question.questionChooseId ? String(question.questionChooseId) : null,
        contentHash: sha256(JSON.stringify({ questionId, questionnaireType, passage })),
        passage,
        studentAudioFileId: audioFileId && audioFileId !== ZERO_UUID ? audioFileId : null,
      };
    });
  if (questions.length !== 2) throw new Error(`Expected two RTA questions, received ${questions.length}.`);
  return {
    schemaVersion: 1,
    scoringId: String(info.id || ''),
    keycode: String(info.keyCode || '').trim().toUpperCase(),
    mockTestId: String(info.mockTestId || ''),
    scoredDate: info.scoredDate || null,
    teacherGroupScore: Number(group.selectedScore),
    labelSource: 'IIG batch-detail groupScorings.selectedScore',
    scoreGroup: {
      id: String(group.scoreScaleGroupId || group.id || ''),
      name: group.scoreScaleGroupName || 'Read text aloud',
      fromQuestion: Number(group.fromQuestion),
      toQuestion: Number(group.toQuestion),
      minScore: Number(group.fromScore),
      maxScore: Number(group.toScore),
    },
    questions,
  };
}

async function fetchSources({ cookie, submissions, batchSize, sourceDir }) {
  await fsp.mkdir(sourceDir, { recursive: true });
  const sources = [];
  const errors = [];
  for (let index = 0; index < submissions.length; index += batchSize) {
    const batch = submissions.slice(index, index + batchSize);
    const missing = [];
    for (const submission of batch) {
      const sourcePath = path.join(sourceDir, `${submission.scoringId}.json`);
      if (fs.existsSync(sourcePath)) sources.push(JSON.parse(await fsp.readFile(sourcePath, 'utf8')));
      else missing.push(submission);
    }
    if (missing.length) {
      const response = await jsonRequest(BATCH_URL, {
        cookie,
        body: { ids: missing.map(item => item.scoringId), isScoring: false },
      });
      const items = Array.isArray(response) ? response : response?.data;
      if (!Array.isArray(items)) throw new Error('IIG batch-detail response is not an array.');
      const byId = new Map(items.map(item => [String(item?.mockTestScoringInfo?.id || ''), item]));
      for (const submission of missing) {
        const raw = byId.get(submission.scoringId);
        try {
          if (!raw) throw new Error(`Batch detail omitted scoring ID ${submission.scoringId}.`);
          const source = filteredSource(raw);
          await writeJsonAtomic(path.join(sourceDir, `${submission.scoringId}.json`), source);
          sources.push(source);
        } catch (error) {
          errors.push({
            scoringId: submission.scoringId,
            keycode: submission.keycode,
            code: error.code || 'RTA_SOURCE_INVALID',
            message: error.message,
          });
        }
      }
    }
    console.log(`[source] ${Math.min(index + batch.length, submissions.length)}/${submissions.length}`);
  }
  return { sources, errors };
}

async function downloadAudio(fileId) {
  const response = await fetch(`${FILE_URL}/${encodeURIComponent(fileId)}/view`, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Audio download failed with HTTP ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('Audio download returned an empty file.');
  return buffer;
}

async function normalizeMp3(inputBuffer, outputPath) {
  const sourcePath = `${outputPath}.source`;
  await fsp.mkdir(path.dirname(outputPath), { recursive: true });
  await fsp.writeFile(sourcePath, inputBuffer);
  try {
    await execFileAsync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
      '-vn', '-ac', '1', '-ar', '16000', '-codec:a', 'libmp3lame', '-b:a', '64k', outputPath,
    ]);
  } finally {
    await fsp.rm(sourcePath, { force: true });
  }
}

async function inspectAudio(audioPath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size,format_name', '-of', 'json', audioPath,
  ]);
  const format = JSON.parse(stdout).format || {};
  const buffer = await fsp.readFile(audioPath);
  return {
    durationSeconds: Number(format.duration),
    sizeBytes: Number(format.size || buffer.length),
    formatName: format.format_name || null,
    checksumSha256: sha256(buffer),
    buffer,
  };
}

function aiInputFor({ source, question, audio }) {
  return {
    schemaVersion: 1,
    question: {
      scorerType: 'READ_TEXT_ALOUD',
      questionNumber: question.questionNumber,
      questionId: question.questionId,
      contextText: question.passage,
      questionText: null,
      promptText: 'Read the text aloud.',
    },
    response: {
      type: 'audio',
      audio: {
        durationSeconds: audio.durationSeconds,
        checksumSha256: audio.checksumSha256,
        quality: { silenceRatio: 0 },
      },
    },
    scoring: {
      scoreGroupId: source.scoreGroup.id,
      officialScale: [0, 1, 2, 3],
    },
  };
}

async function assessQuestion({ source, question, audioPath, resultPath, key, region }) {
  if (fs.existsSync(resultPath)) {
    try {
      const previous = JSON.parse(await fsp.readFile(resultPath, 'utf8'));
      if (previous.status === 'SUCCESS') return previous;
    } catch {
      await fsp.rm(resultPath, { force: true });
    }
  }
  const audio = await inspectAudio(audioPath);
  const aiInput = aiInputFor({ source, question, audio });
  let azure;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      azure = await azureClient.assess({
        audioBuffer: audio.buffer,
        referenceText: question.passage,
        key,
        region,
      });
      break;
    } catch (error) {
      lastError = error;
      if (error.retryable === false || attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  if (!azure) throw lastError || new Error('Azure assessment did not return a result.');
  if (azure.result.status !== 'SUCCESS') {
    const result = {
      schemaVersion: 1,
      status: azure.result.status,
      scoringId: source.scoringId,
      keycode: source.keycode,
      questionNumber: question.questionNumber,
      teacherGroupScore: source.teacherGroupScore,
      audio: { ...audio, buffer: undefined },
      transcript: azure.result.transcript,
      azureRawOutput: azure.rawOutput,
      error: null,
    };
    await writeJsonAtomic(resultPath, result);
    return result;
  }
  const extracted = extractFeatures({ aiInput, transcript: azure.result.transcript, featureVersion: FEATURE_VERSION });
  const request = buildReadAloudEvidenceRequest({
    aiInput,
    transcript: azure.result.transcript,
    deterministicFeatures: extracted.features.task.deterministic,
  });
  const rawEvidence = normalizeAzureEvidence({ rawOutput: azure.rawOutput, request });
  const evidence = normalizeReadAloudSpeechEvidence(rawEvidence);
  const merged = mergeEvidence(extracted.features, 'SPEECH_EVIDENCE', evidence);
  const ml = buildRtaMlFeatures({
    aiInput,
    transcript: azure.result.transcript,
    features: merged.features,
    azureRawOutput: azure.rawOutput,
  });
  const result = {
    schemaVersion: 1,
    status: 'SUCCESS',
    scoringId: source.scoringId,
    keycode: source.keycode,
    mockTestId: source.mockTestId,
    scoredDate: source.scoredDate,
    questionNumber: question.questionNumber,
    questionId: question.questionId,
    questionChooseId: question.questionChooseId,
    passageHash: sha256(question.passage),
    contentHash: question.contentHash,
    studentAudioFileId: question.studentAudioFileId,
    teacherGroupScore: source.teacherGroupScore,
    labelSource: source.labelSource,
    audio: { ...audio, buffer: undefined, localPath: audioPath },
    transcript: azure.result.transcript,
    azure: {
      provider: azure.provider,
      providerRunId: azure.providerRunId,
      usage: azure.usage,
      rawOutput: azure.rawOutput,
    },
    evidence,
    mlFeatures: ml,
  };
  await writeJsonAtomic(resultPath, result);
  return result;
}

async function mapConcurrent(items, concurrency, handler) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await handler(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function csvValue(value) {
  if (value == null) return '';
  const source = String(value);
  return /[",\n\r]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
}

function toCsv(rows, columns) {
  return `${[columns, ...rows.map(row => columns.map(column => row[column]))]
    .map(row => row.map(csvValue).join(','))
    .join('\n')}\n`;
}

function questionRow(result) {
  return {
    scoring_id: result.scoringId,
    keycode: result.keycode,
    mock_test_id: result.mockTestId,
    question_number: result.questionNumber,
    question_id: result.questionId,
    passage_hash: result.passageHash,
    audio_sha256: result.audio?.checksumSha256,
    audio_duration_seconds: result.audio?.durationSeconds,
    status: result.status,
    teacher_group_score: result.teacherGroupScore,
    label_source: result.labelSource,
    transcript: result.transcript,
    ...(result.mlFeatures?.values || {}),
  };
}

function groupRows(results) {
  const grouped = new Map();
  for (const result of results.filter(item => item.status === 'SUCCESS')) {
    if (!grouped.has(result.scoringId)) grouped.set(result.scoringId, []);
    grouped.get(result.scoringId).push(result);
  }
  const rows = [];
  for (const [scoringId, items] of grouped) {
    const q1 = items.find(item => item.questionNumber === 1);
    const q2 = items.find(item => item.questionNumber === 2);
    if (!q1 || !q2) continue;
    const row = {
      scoring_id: scoringId,
      keycode: q1.keycode,
      mock_test_id: q1.mockTestId,
      q1_passage_hash: q1.passageHash,
      q2_passage_hash: q2.passageHash,
      q1_audio_sha256: q1.audio.checksumSha256,
      q2_audio_sha256: q2.audio.checksumSha256,
      teacher_group_score: q1.teacherGroupScore,
      label_source: q1.labelSource,
    };
    for (const feature of RTA_ML_FEATURE_NAMES) {
      row[`q1_${feature}`] = q1.mlFeatures.values[feature];
      row[`q2_${feature}`] = q2.mlFeatures.values[feature];
    }
    rows.push(row);
  }
  return rows;
}

async function main() {
  const requestFile = required(option('--request-file'), 'Usage: --request-file <curl.txt> --output-dir <dir>');
  const outputDir = path.resolve(required(option('--output-dir'), '--output-dir is required.'));
  const limit = integerOption('--limit', Number.MAX_SAFE_INTEGER);
  const pageSize = integerOption('--page-size', 100);
  const batchSize = integerOption('--batch-size', 20);
  const concurrency = integerOption('--concurrency', 4);
  const sourceOnly = process.argv.includes('--source-only');
  const key = required(process.env.AZURE_SPEECH_KEY, 'AZURE_SPEECH_KEY is missing.');
  const region = required(process.env.AZURE_SPEECH_REGION, 'AZURE_SPEECH_REGION is missing.');
  const cookie = parseCookieFromCurl(requestFile);
  const sourceDir = path.join(outputDir, 'source');
  const audioDir = path.join(outputDir, 'audio');
  const resultDir = path.join(outputDir, 'azure');
  await Promise.all([sourceDir, audioDir, resultDir].map(directory => fsp.mkdir(directory, { recursive: true })));

  const listed = await listScoredSubmissions({ cookie, limit, pageSize });
  console.log(`[list] selected ${listed.items.length}/${listed.totalCount} scored submissions`);
  const fetched = await fetchSources({ cookie, submissions: listed.items, batchSize, sourceDir });
  const { sources } = fetched;
  await fsp.writeFile(
    path.join(outputDir, 'source_errors.jsonl'),
    fetched.errors.map(error => JSON.stringify(error)).join('\n') + (fetched.errors.length ? '\n' : '')
  );
  const sourceSummary = {
    generatedAt: new Date().toISOString(),
    totalAvailable: listed.totalCount,
    duplicateListRows: listed.duplicateCount,
    selectedSubmissions: listed.items.length,
    validRtaSubmissions: sources.length,
    invalidRtaSubmissions: fetched.errors.length,
    labelDistribution: Object.fromEntries([0, 1, 2, 3].map(score => [
      score,
      sources.filter(source => source.teacherGroupScore === score).length,
    ])),
    uniqueMockTests: new Set(sources.map(source => source.mockTestId)).size,
    uniqueQ1Passages: new Set(sources.map(source => source.questions[0]?.contentHash).filter(Boolean)).size,
    uniqueQ2Passages: new Set(sources.map(source => source.questions[1]?.contentHash).filter(Boolean)).size,
    missingStudentAudioQuestions: sources.flatMap(source => source.questions)
      .filter(question => !question.studentAudioFileId).length,
  };
  await fsp.writeFile(path.join(outputDir, 'source_summary.json'), `${JSON.stringify(sourceSummary, null, 2)}\n`);
  if (sourceOnly) {
    console.log(`[done:source-only] ${outputDir}`);
    return;
  }
  const tasks = sources.flatMap(source => source.questions.map(question => ({ source, question })));
  let completed = 0;
  const results = await mapConcurrent(tasks, concurrency, async ({ source, question }) => {
    const submissionAudioDir = path.join(audioDir, source.scoringId);
    const audioPath = path.join(submissionAudioDir, `q${question.questionNumber}.mp3`);
    const resultPath = path.join(resultDir, `${source.scoringId}-q${question.questionNumber}.json`);
    try {
      if (!fs.existsSync(audioPath)) {
        const raw = await downloadAudio(question.studentAudioFileId);
        await normalizeMp3(raw, audioPath);
      }
      return await assessQuestion({ source, question, audioPath, resultPath, key, region });
    } catch (error) {
      const result = {
        schemaVersion: 1,
        status: 'FAILED',
        scoringId: source.scoringId,
        keycode: source.keycode,
        mockTestId: source.mockTestId,
        questionNumber: question.questionNumber,
        questionId: question.questionId,
        teacherGroupScore: source.teacherGroupScore,
        labelSource: source.labelSource,
        error: { code: error.code || 'RTA_BACKFILL_FAILED', message: error.message },
      };
      await writeJsonAtomic(resultPath, result);
      return result;
    } finally {
      completed += 1;
      console.log(`[azure] ${completed}/${tasks.length}`);
    }
  });

  const questionRows = results.map(questionRow);
  const questionColumns = [
    'scoring_id', 'keycode', 'mock_test_id', 'question_number', 'question_id', 'passage_hash',
    'audio_sha256', 'audio_duration_seconds', 'status', 'teacher_group_score', 'label_source', 'transcript',
    ...RTA_ML_FEATURE_NAMES,
  ];
  const groups = groupRows(results);
  const groupColumns = [
    'scoring_id', 'keycode', 'mock_test_id', 'q1_passage_hash', 'q2_passage_hash',
    'q1_audio_sha256', 'q2_audio_sha256', 'teacher_group_score', 'label_source',
    ...RTA_ML_FEATURE_NAMES.flatMap(feature => [`q1_${feature}`, `q2_${feature}`]),
  ];
  await fsp.writeFile(path.join(outputDir, 'question_evidence.csv'), toCsv(questionRows, questionColumns));
  await fsp.writeFile(path.join(outputDir, 'group_training.csv'), toCsv(groups, groupColumns));
  await fsp.writeFile(
    path.join(outputDir, 'run_summary.json'),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      totalAvailable: listed.totalCount,
      selectedSubmissions: sources.length,
      questionTasks: tasks.length,
      successfulQuestions: results.filter(item => item.status === 'SUCCESS').length,
      failedQuestions: results.filter(item => item.status === 'FAILED').length,
      completeTrainingGroups: groups.length,
      labelDistribution: Object.fromEntries([...new Set(groups.map(row => row.teacher_group_score))]
        .sort((a, b) => a - b)
        .map(score => [score, groups.filter(row => row.teacher_group_score === score).length])),
      featureVersion: 'rta-ml-features-v1',
      azureRawSchemaVersion: azureClient.RAW_SCHEMA_VERSION,
    }, null, 2)}\n`
  );
  console.log(`[done] ${outputDir}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseCookieFromCurl,
  technicalListItem,
  rtaGroup,
  filteredSource,
  csvValue,
  toCsv,
  groupRows,
};
