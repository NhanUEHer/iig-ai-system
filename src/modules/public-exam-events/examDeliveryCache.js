const crypto = require('crypto');
const redis = require('../../config/redis');
const storage = require('../../services/storageService');

const CACHE_SCHEMA = 'v2';
const TTL_SECONDS = Math.max(300, Number(process.env.EXAM_DELIVERY_CACHE_TTL_SECONDS || 86400));
const valueOf = (object, camel, snake) => object?.[camel] ?? object?.[snake] ?? null;
const cacheKey = versionId => `exam:delivery:${CACHE_SCHEMA}:${versionId}`;
const gradingKey = versionId => `exam:grading:${CACHE_SCHEMA}:${versionId}`;
const lockKey = versionId => `exam:delivery:lock:${CACHE_SCHEMA}:${versionId}`;
const publishedPrefix = (examId, generationId) => `exam:published:${CACHE_SCHEMA}:${examId}:${generationId}`;
const currentKey = examId => `exam:published:${CACHE_SCHEMA}:${examId}:current`;
const attemptPrefix = attemptId => `exam:attempt:${CACHE_SCHEMA}:${attemptId}`;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const deliveryMemory = new Map();
const gradingMemory = new Map();
const memoryRead = (cache, key) => {
  const item = cache.get(key);
  if (item?.expiresAt > Date.now()) return item.value;
  if (item) cache.delete(key);
  return null;
};
const memoryWrite = (cache, key, value) => { cache.set(key, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 }); return value; };

async function signedMedia(mediaRows) {
  return Promise.all(mediaRows.map(async item => ({
    id: item.id,
    type: String(item.media_type || '').toUpperCase(),
    mimeType: item.mime_type || null,
    name: item.original_name || null,
    durationSeconds: Number(item.duration_seconds || 0),
    url: item.storage_key ? await storage.getSignedUrl(item.storage_key) : null,
  })));
}

async function build(snapshot = {}, mediaRows = []) {
  const mediaByTarget = new Map();
  for (const row of mediaRows) {
    const targetId = row.content_id || row.sub_question_id || row.part_id;
    if (!mediaByTarget.has(targetId)) mediaByTarget.set(targetId, []);
    mediaByTarget.get(targetId).push(row);
  }
  let number = 0;
  const parts = [];
  for (const [partIndex, part] of (snapshot.parts || []).entries()) {
    const questions = [];
    for (const parent of part.questions || []) {
      const contents = new Map((parent.contents || []).map(content => [content.id, content]));
      const groupFrom = number + 1;
      const groupTo = groupFrom + Math.max(0, (parent.subQuestions || []).length - 1);
      const groupLabel = groupFrom === groupTo ? `Câu hỏi ${groupFrom}` : `Câu hỏi ${groupFrom}–${groupTo}`;
      for (const subQuestion of parent.subQuestions || []) {
        number += 1;
        const contentId = valueOf(subQuestion, 'contentId', 'content_id');
        const content = contents.get(contentId) || null;
        const contentMedia = await signedMedia(mediaByTarget.get(contentId) || []);
        const questionMedia = await signedMedia(mediaByTarget.get(subQuestion.id) || []);
        const audio = contentMedia.find(item => item.type === 'AUDIO') || null;
        const image = contentMedia.find(item => item.type === 'IMAGE') || null;
        const video = contentMedia.find(item => item.type === 'VIDEO') || null;
        const questionAudio = questionMedia.find(item => item.type === 'AUDIO') || null;
        questions.push({
          id: subQuestion.id,
          number,
          parentQuestionId: parent.id,
          questionType: valueOf(parent, 'questionType', 'question_type') || 'MCQ_SINGLE',
          group: { from: groupFrom, to: groupTo, label: groupLabel },
          content: content ? {
            id: content.id,
            title: content.title || '',
            html: valueOf(content, 'contentHtml', 'content_html') || '',
            audioUrl: audio?.url || null,
            imageUrl: image?.url || null,
            videoUrl: video?.url || null,
            media: contentMedia,
          } : { id: null, title: '', html: '', audioUrl: audio?.url || null, imageUrl: image?.url || null, videoUrl: video?.url || null, media: contentMedia },
          promptHtml: valueOf(subQuestion, 'promptHtml', 'prompt_html') || '',
          questionAudioUrl: questionAudio?.url || null,
          questionMedia,
          preparationDurationSeconds: Number(valueOf(subQuestion, 'preparationDurationSeconds', 'preparation_duration_seconds') || 0),
          recordingDurationSeconds: Number(valueOf(subQuestion, 'recordingDurationSeconds', 'recording_duration_seconds') || 0),
          minWordCount: Number(valueOf(subQuestion, 'minWordCount', 'min_word_count') || 0),
          maxWordCount: Number(valueOf(subQuestion, 'maxWordCount', 'max_word_count') || 0),
          maxCharacterCount: Number(valueOf(subQuestion, 'maxCharacterCount', 'max_character_count') || 0),
          options: (subQuestion.options || []).map(option => ({
            id: option.id,
            key: valueOf(option, 'optionKey', 'option_key'),
            text: valueOf(option, 'optionText', 'option_text') || '',
          })),
        });
      }
    }
    parts.push({
      id: part.id,
      sectionId: part.sectionId || null,
      examMode: part.examMode || null,
      type: part.examMode === 'RECORD_NON_STOP' ? 'SPEAKING'
        : part.examMode === 'WRITING_NON_STOP' ? 'WRITING'
          : part.examMode === 'NON_STOP' ? 'LISTENING' : 'READING',
      title: part.title || `Phần ${partIndex + 1}`,
      order: Number(valueOf(part, 'displayOrder', 'display_order') ?? partIndex),
      instructionHtml: part.instructionHtml || '',
      instructionAudio: (await signedMedia(mediaByTarget.get(part.id) || []))[0] || null,
      breakDurationSeconds: Number(part.breakDurationSeconds || 0),
      configuredDurationSeconds: Number(part.configuredDurationSeconds || 0),
      questions,
    });
  }
  const sections = (snapshot.sections || []).map(section => ({
    id: section.id,
    title: section.title,
    examMode: section.examMode,
    questionCount: Number(section.questionCount || 0),
    configuredDurationSeconds: Number(section.configuredDurationSeconds || 0),
    sortOrder: Number(section.sortOrder || 0),
    parts: parts.filter(part => part.sectionId === section.id).map(part => part.id),
  }));
  return { exam: { ...snapshot.exam, id: snapshot.exam?.id || null, title: snapshot.exam?.title || '', totalQuestions: number }, sections, parts };
}

function buildBundle(delivery, snapshot = {}) {
  const details = {};
  const partQuestions = {};
  const questionGroups = {};
  for (const part of delivery.parts || []) {
    const grouped = [];
    const groupedByParent = new Map();
    for (const question of part.questions || []) {
      let group = groupedByParent.get(question.parentQuestionId);
      if (!group) {
        group = {
          id: question.parentQuestionId,
          examId: delivery.exam.id,
          sectionId: part.sectionId,
          partId: part.id,
          partTitle: part.title,
          examMode: part.examMode,
          sortOrder: grouped.length,
          range: question.group,
          content: question.content,
          breakDurationSeconds: Number(part.breakDurationSeconds || 0),
          questions: [],
        };
        groupedByParent.set(question.parentQuestionId, group);
        grouped.push(group);
      }
      group.questions.push({
        id: question.id,
        parentQuestionId: question.parentQuestionId,
        number: question.number,
        sortOrder: group.questions.length,
        questionType: question.questionType,
        promptHtml: question.promptHtml,
        questionAudioUrl: question.questionAudioUrl,
        questionMedia: question.questionMedia,
        preparationDurationSeconds: question.preparationDurationSeconds,
        recordingDurationSeconds: question.recordingDurationSeconds,
        minWordCount: question.minWordCount,
        maxWordCount: question.maxWordCount,
        maxCharacterCount: question.maxCharacterCount,
        options: question.options,
      });
    }
    for (const group of grouped) questionGroups[group.id] = group;
    partQuestions[part.id] = {
      examId: delivery.exam.id,
      sectionId: part.sectionId,
      partId: part.id,
      examMode: part.examMode,
      breakDurationSeconds: Number(part.breakDurationSeconds || 0),
      questionGroups: grouped.map(group => ({
        id: group.id,
        range: group.range,
        sortOrder: group.sortOrder,
        questionCount: group.questions.length,
        contentAudioDurationSeconds: Number(group.content?.media?.find(item => item.type === 'AUDIO')?.durationSeconds || 0),
      })),
      questions: part.questions.map((question, index) => ({
        id: question.id,
        parentQuestionId: question.parentQuestionId,
        number: question.number,
        sortOrder: index,
        questionType: question.questionType,
        contentAudioDurationSeconds: Number(question.content?.media?.find(item => item.type === 'AUDIO')?.durationSeconds || 0),
        questionAudioDurationSeconds: Number(question.questionMedia?.find(item => item.type === 'AUDIO')?.durationSeconds || 0),
        preparationDurationSeconds: question.preparationDurationSeconds,
        recordingDurationSeconds: question.recordingDurationSeconds,
      })),
    };
    for (const [index, question] of part.questions.entries()) details[question.id] = {
      ...question,
      examId: delivery.exam.id,
      sectionId: part.sectionId,
      partId: part.id,
      sortOrder: index,
      minWordCount: Number(valueOf(question, 'minWordCount', 'min_word_count') || 0),
      maxWordCount: Number(valueOf(question, 'maxWordCount', 'max_word_count') || 0),
      maxCharacterCount: Number(valueOf(question, 'maxCharacterCount', 'max_character_count') || 0),
    };
  }
  const totalDurationSeconds = (delivery.sections || []).reduce((sum, section) => sum + Number(section.configuredDurationSeconds || 0), 0);
  return {
    manifest: {
      schema: 'exam-delivery-v1',
      exam: {
        id: delivery.exam.id,
        code: delivery.exam.code || null,
        title: delivery.exam.title,
        examType: delivery.exam.examType || null,
        description: delivery.exam.description || '',
        introductionHtml: delivery.exam.introductionHtml || '',
        displayLabel: delivery.exam.displayLabel || '',
        difficulty: delivery.exam.difficulty || null,
        groups: Array.isArray(delivery.exam.groups) ? delivery.exam.groups : [],
        cardImageStorageKey: delivery.exam.cardImageStorageKey || null,
        totalSections: delivery.sections.length,
        totalParts: delivery.parts.length,
        totalQuestions: delivery.exam.totalQuestions,
        totalDurationSeconds,
      },
    },
    structure: {
      examId: delivery.exam.id,
      sections: (delivery.sections || []).map(section => ({
        ...section,
        parts: section.parts.map(partId => {
          const part = delivery.parts.find(item => item.id === partId);
          return {
            id: part.id, title: part.title, sortOrder: part.order,
            questionCount: part.questions.length, instructionHtml: part.instructionHtml,
            instructionAudio: part.instructionAudio, breakDurationSeconds: part.breakDurationSeconds,
            configuredDurationSeconds: part.configuredDurationSeconds,
          };
        }),
      })),
    },
    partQuestions,
    questionGroups,
    questions: details,
    grading: buildGrading(snapshot),
    legacy: delivery,
  };
}

async function buildDeliveryBundle(snapshot = {}, mediaRows = []) {
  const delivery = await build(snapshot, mediaRows);
  return buildBundle(delivery, snapshot);
}

function generationKeys(examId, generationId, bundle) {
  const prefix = publishedPrefix(examId, generationId);
  const entries = [
    [`${prefix}:manifest`, bundle.manifest],
    [`${prefix}:structure`, bundle.structure],
    [`${prefix}:grading`, bundle.grading],
  ];
  for (const [partId, payload] of Object.entries(bundle.partQuestions)) entries.push([`${prefix}:part:${partId}:questions`, payload]);
  for (const [groupId, payload] of Object.entries(bundle.questionGroups)) entries.push([`${prefix}:group:${groupId}`, payload]);
  for (const [questionId, payload] of Object.entries(bundle.questions)) entries.push([`${prefix}:question:${questionId}`, payload]);
  return entries;
}

async function publishGeneration(examId, snapshot, mediaRows = []) {
  const bundle = await buildDeliveryBundle(snapshot, mediaRows);
  if (!redis.configured()) return { generationId: null, bundle, cache: 'DISABLED' };
  const active = await redis.connection();
  if (!active) return { generationId: null, bundle, cache: 'BYPASS' };
  const generationId = crypto.randomUUID();
  const oldGeneration = await active.get(currentKey(examId));
  const entries = generationKeys(examId, generationId, bundle);
  const indexKey = `${publishedPrefix(examId, generationId)}:keys`;
  const multi = active.multi();
  // A published generation is the canonical public source until the next
  // publish/deactivate action. It must not disappear because a delivery TTL
  // elapsed while the exam is still active.
  for (const [key, payload] of entries) multi.set(key, JSON.stringify(payload));
  if (entries.length) multi.sAdd(indexKey, entries.map(([key]) => key));
  multi.set(currentKey(examId), generationId);
  await multi.exec();
  if (oldGeneration && oldGeneration !== generationId) {
    const oldIndex = `${publishedPrefix(examId, oldGeneration)}:keys`;
    const oldKeys = await active.sMembers(oldIndex).catch(() => []);
    if (oldKeys.length) await active.del(oldKeys);
    await active.del(oldIndex);
  }
  return { generationId, bundle, cache: 'WARMED' };
}

async function clearPublished(examId) {
  if (!redis.configured()) return false;
  const active = await redis.connection();
  if (!active) return false;
  const generationId = await active.get(currentKey(examId));
  if (!generationId) return true;
  const indexKey = `${publishedPrefix(examId, generationId)}:keys`;
  const keys = await active.sMembers(indexKey).catch(() => []);
  const multi = active.multi();
  if (keys.length) multi.del(keys);
  multi.del(indexKey);
  multi.del(currentKey(examId));
  await multi.exec();
  return true;
}

async function readPublished(examId, type, id = null) {
  if (!redis.configured()) return null;
  const generationId = await redis.get(currentKey(examId));
  if (!generationId) return null;
  const prefix = publishedPrefix(examId, generationId);
  const key = type === 'partQuestions' ? `${prefix}:part:${id}:questions`
    : type === 'questionGroup' ? `${prefix}:group:${id}`
    : type === 'question' ? `${prefix}:question:${id}` : `${prefix}:${type}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try { return { generationId, payload: JSON.parse(raw) }; } catch { return null; }
}

async function writeAttemptBundle(attemptId, bundle) {
  if (!redis.configured()) return false;
  const active = await redis.connection();
  if (!active) return false;
  const prefix = attemptPrefix(attemptId);
  const entries = [
    [`${prefix}:manifest`, bundle.manifest],
    [`${prefix}:structure`, bundle.structure],
    [`${prefix}:grading`, bundle.grading],
  ];
  for (const [partId, payload] of Object.entries(bundle.partQuestions)) entries.push([`${prefix}:part:${partId}:questions`, payload]);
  for (const [groupId, payload] of Object.entries(bundle.questionGroups)) entries.push([`${prefix}:group:${groupId}`, payload]);
  for (const [questionId, payload] of Object.entries(bundle.questions)) entries.push([`${prefix}:question:${questionId}`, payload]);
  const multi = active.multi();
  for (const [key, payload] of entries) multi.set(key, JSON.stringify(payload), { EX: TTL_SECONDS });
  await multi.exec();
  return true;
}

async function readAttemptPiece(attemptId, type, id = null) {
  if (!redis.configured()) return null;
  const prefix = attemptPrefix(attemptId);
  const key = type === 'partQuestions' ? `${prefix}:part:${id}:questions`
    : type === 'questionGroup' ? `${prefix}:group:${id}`
    : type === 'question' ? `${prefix}:question:${id}` : `${prefix}:${type}`;
  const raw = await redis.get(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { await redis.remove(key); return null; }
}

async function getAttemptPieceOrBuild(attemptId, type, id, builder) {
  const cached = await readAttemptPiece(attemptId, type, id);
  if (cached) return { payload: cached, cache: 'HIT' };
  const bundle = await builder();
  await writeAttemptBundle(attemptId, bundle);
  const payload = type === 'partQuestions' ? bundle.partQuestions[id]
    : type === 'questionGroup' ? bundle.questionGroups[id]
    : type === 'question' ? bundle.questions[id] : bundle[type];
  return { payload: payload || null, cache: redis.configured() ? 'MISS' : 'DISABLED' };
}

async function read(versionId) {
  const memory = memoryRead(deliveryMemory, versionId);
  if (memory) return memory;
  const raw = await redis.get(cacheKey(versionId));
  if (!raw) return null;
  try { return memoryWrite(deliveryMemory, versionId, JSON.parse(raw)); }
  catch { await redis.remove(cacheKey(versionId)); return null; }
}

async function write(versionId, payload) {
  await redis.set(cacheKey(versionId), JSON.stringify(payload), { EX: TTL_SECONDS });
  return memoryWrite(deliveryMemory, versionId, payload);
}

function buildGrading(snapshot = {}) {
  const questions = {};
  const sections = Object.fromEntries((snapshot.sections || []).map(section => [section.id, {
    id: section.id,
    title: section.title,
    examMode: section.examMode,
    questionCount: Number(section.questionCount || 0),
    scoreScaleId: section.scoreScaleId || null,
    scoreScale: section.scoreScale || null,
  }]));
  for (const part of snapshot.parts || []) for (const parent of part.questions || []) for (const sub of parent.subQuestions || []) {
    const correctOptions = (sub.options || []).filter(option => option.is_correct === true);
    const correct = correctOptions[0];
    questions[sub.id] = {
      subQuestionId: sub.id,
      parentQuestionId: parent.id,
      questionType: valueOf(parent, 'questionType', 'question_type') || 'MCQ_SINGLE',
      preparationDurationSeconds: Number(valueOf(sub, 'preparationDurationSeconds', 'preparation_duration_seconds') || 0),
      recordingDurationSeconds: Number(valueOf(sub, 'recordingDurationSeconds', 'recording_duration_seconds') || 0),
      partId: part.id,
      partTitle: part.title || 'Phần thi',
      sectionId: part.sectionId || null,
      sectionTitle: part.sectionTitle || sections[part.sectionId]?.title || 'Phần thi',
      examMode: part.examMode || sections[part.sectionId]?.examMode || null,
      correctOptionKey: valueOf(correct, 'optionKey', 'option_key'),
      correctOptionCount: correctOptions.length,
      optionKeys: (sub.options || []).map(option => valueOf(option, 'optionKey', 'option_key')),
      points: Number(snapshot.exam?.pointsPerSubQuestion || 0),
    };
  }
  return { exam: snapshot.exam || {}, sections, questions };
}

async function readGrading(versionId) {
  const memory = memoryRead(gradingMemory, versionId);
  if (memory) return memory;
  const raw = await redis.get(gradingKey(versionId));
  if (!raw) return null;
  try { return memoryWrite(gradingMemory, versionId, JSON.parse(raw)); } catch { await redis.remove(gradingKey(versionId)); return null; }
}

async function writeGrading(versionId, payload) {
  await redis.set(gradingKey(versionId), JSON.stringify(payload), { EX: TTL_SECONDS });
  return memoryWrite(gradingMemory, versionId, payload);
}

async function getGradingOrBuild(versionId, builder) {
  const cached = await readGrading(versionId);
  if (cached) return cached;
  const snapshot = await builder();
  const payload = buildGrading(snapshot);
  if (redis.configured()) await writeGrading(versionId, payload);
  return payload;
}

async function acquire(versionId) {
  const token = crypto.randomUUID();
  const result = await redis.set(lockKey(versionId), token, { NX: true, EX: 10 });
  return result === 'OK' ? token : null;
}

async function release(versionId, token) {
  const active = await redis.connection();
  if (!active || !token) return;
  await active.eval(
    `if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end`,
    { keys: [lockKey(versionId)], arguments: [token] },
  ).catch(() => {});
}

async function getOrBuild(versionId, builder) {
  if (!redis.configured()) return { payload: await builder(), cache: 'DISABLED' };
  const cached = await read(versionId);
  if (cached) return { payload: cached, cache: 'HIT' };
  const token = await acquire(versionId);
  if (!token) {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await wait(100);
      const retry = await read(versionId);
      if (retry) return { payload: retry, cache: 'HIT_AFTER_WAIT' };
    }
    return { payload: await builder(), cache: 'BYPASS' };
  }
  try {
    const payload = await builder();
    await write(versionId, payload);
    return { payload, cache: 'MISS' };
  } finally {
    await release(versionId, token);
  }
}

module.exports = {
  build, buildBundle, buildDeliveryBundle, buildGrading,
  publishGeneration, clearPublished, readPublished, currentKey, publishedPrefix,
  writeAttemptBundle, readAttemptPiece, getAttemptPieceOrBuild, attemptPrefix,
  read, write, readGrading, writeGrading, getOrBuild, getGradingOrBuild,
  cacheKey, gradingKey, TTL_SECONDS,
};
