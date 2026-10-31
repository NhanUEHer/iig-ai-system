const { createHash } = require('node:crypto');
const { stableStringify } = require('./sourcePayloadValidator');

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

class CanonicalizationError extends Error {
  constructor(message, code = 'IIG_CANONICALIZATION_FAILED') {
    super(message);
    this.name = 'CanonicalizationError';
    this.code = code;
    this.retryable = false;
  }
}

function sha256(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  return text || null;
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function imageUrls(html) {
  const urls = [];
  const source = String(html || '');
  const pattern = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pattern.exec(source))) {
    const url = safeUrl(match[1]);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function stableAssetManifest(assets) {
  return assets.map(asset => {
    if (!asset.url) return asset;
    const url = new URL(asset.url);
    url.search = '';
    url.hash = '';
    return { ...asset, url: url.toString() };
  });
}

function scorerType(name) {
  const normalized = String(name || '').toLowerCase();
  if (normalized.includes('read text aloud')) return 'READ_TEXT_ALOUD';
  if (normalized.includes('describe a picture')) return 'DESCRIBE_PICTURE';
  if (normalized.includes('using information')) return 'RESPOND_USING_INFORMATION';
  if (normalized.includes('respond to questions')) return 'RESPOND_TO_QUESTIONS';
  if (normalized.includes('express an opinion')) return 'EXPRESS_AN_OPINION';
  if (normalized.includes('write a sentence')) return 'WRITE_SENTENCE_PICTURE';
  if (normalized.includes('written request')) return 'RESPOND_TO_WRITTEN_REQUEST';
  if (normalized.includes('opinion essay')) return 'WRITE_OPINION_ESSAY';
  return 'UNKNOWN';
}

function scorerTypeForQuestion(groupName, questionnaireType, questionNumber) {
  const type = Number(questionnaireType);
  const number = Number(questionNumber);
  if ([13, 14].includes(type) && Number.isInteger(number)) {
    if (number <= 2) return 'READ_TEXT_ALOUD';
    if (number <= 4) return 'DESCRIBE_PICTURE';
    if (number <= 7) return 'RESPOND_TO_QUESTIONS';
    if (number <= 10) return 'RESPOND_USING_INFORMATION';
    return 'EXPRESS_AN_OPINION';
  }
  if (type === 15 && Number.isInteger(number)) {
    if (number <= 5) return 'WRITE_SENTENCE_PICTURE';
    if (number <= 7) return 'RESPOND_TO_WRITTEN_REQUEST';
    return 'WRITE_OPINION_ESSAY';
  }
  return scorerType(groupName);
}

function questionDetails(question) {
  const info = question.questionnaireInfo || {};
  const candidates = [
    ...(Array.isArray(info.questionReadTexts) ? info.questionReadTexts : []),
    ...(Array.isArray(info.questionRecordFrees) ? info.questionRecordFrees : []),
    ...(Array.isArray(info.questionWritings) ? info.questionWritings : []),
  ];
  return candidates.find(item => String(item?.id) === String(question.questionId)) || null;
}

function assetManifest(question, type) {
  const info = question.questionnaireInfo || {};
  const details = questionDetails(question) || {};
  const assets = [];
  const push = (role, sourceFileId, url, isRequired = true) => {
    if (!sourceFileId && !url) return;
    const index = assets.filter(asset => asset.role === role).length;
    assets.push({ role, index, isRequired, sourceFileId: sourceFileId || null, url: url || null });
  };

  if (details.audioFileId && details.audioFileId !== ZERO_UUID) {
    push('QUESTION_AUDIO', String(details.audioFileId), null, !cleanText(details.content));
  }
  for (const left of Array.isArray(info.leftSections) ? info.leftSections : []) {
    if (left?.audioFileId && left.audioFileId !== ZERO_UUID) {
      push('CONTEXT_AUDIO', String(left.audioFileId), null, false);
    }
    const imageRole = ['DESCRIBE_PICTURE', 'WRITE_SENTENCE_PICTURE'].includes(type)
      ? 'QUESTION_IMAGE'
      : 'CONTEXT_IMAGE';
    for (const url of imageUrls(left?.textContent)) push(imageRole, null, url, true);
  }
  return assets;
}

function normalizeGroup(group, index) {
  const fromQuestion = Number(group.fromQuestion);
  const toQuestion = Number(group.toQuestion);
  if (!Number.isInteger(fromQuestion) || !Number.isInteger(toQuestion) || fromQuestion < 1 || toQuestion < fromQuestion) {
    throw new CanonicalizationError('IIG score group contains an invalid question range.', 'IIG_SCORE_GROUP_RANGE_INVALID');
  }
  const sourceGroupId = String(group.scoreScaleGroupId || group.id || '').trim();
  if (!sourceGroupId) {
    throw new CanonicalizationError('IIG score group does not contain an ID.', 'IIG_SCORE_GROUP_ID_MISSING');
  }
  return {
    sourceGroupId,
    groupKey: sourceGroupId,
    name: String(group.scoreScaleGroupName || `Score group ${index + 1}`),
    sourceSectionId: String(group.mocktestSectionId || '').trim(),
    fromQuestion,
    toQuestion,
    minScore: group.fromScore == null ? null : Number(group.fromScore),
    maxScore: group.toScore == null ? null : Number(group.toScore),
    sortOrder: Number.isInteger(Number(group.sortOrder)) ? Number(group.sortOrder) : index,
  };
}

function canonicalizeSourcePayload(payload) {
  const info = payload?.mockTestScoringInfo || {};
  const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
  const groups = (Array.isArray(payload?.groupScorings) ? payload.groupScorings : [])
    .map(normalizeGroup);
  if (!String(info.mockTestId || '').trim() || !rawQuestions.length || !groups.length) {
    throw new CanonicalizationError('IIG source snapshot is missing exam identity, questions, or score groups.');
  }

  const sectionIds = [...new Set(groups.map(group => group.sourceSectionId).filter(Boolean))];
  if (!sectionIds.length) {
    throw new CanonicalizationError('IIG score groups do not identify any exam section.', 'IIG_SECTION_ID_MISSING');
  }
  const sectionCounters = new Map();
  const questions = rawQuestions.map((question, globalIndex) => {
    const globalNumber = globalIndex + 1;
    const matchingGroups = groups.filter(group => globalNumber >= group.fromQuestion && globalNumber <= group.toQuestion);
    if (!matchingGroups.length) {
      throw new CanonicalizationError(`IIG question ${globalNumber} is not assigned to a score group.`, 'IIG_QUESTION_GROUP_MISSING');
    }
    const sectionId = matchingGroups[0].sourceSectionId;
    if (!sectionId || matchingGroups.some(group => group.sourceSectionId !== sectionId)) {
      throw new CanonicalizationError(`IIG question ${globalNumber} has an ambiguous section.`, 'IIG_QUESTION_SECTION_AMBIGUOUS');
    }
    const questionId = String(question.questionId || '').trim();
    if (!questionId) {
      throw new CanonicalizationError(`IIG question ${globalNumber} does not contain questionId.`, 'IIG_QUESTION_ID_MISSING');
    }
    const details = questionDetails(question) || {};
    const questionnaire = question.questionnaireInfo || {};
    const leftSections = Array.isArray(questionnaire.leftSections) ? questionnaire.leftSections : [];
    const primaryGroup = matchingGroups[0];
    const localNumber = (sectionCounters.get(sectionId) || 0) + 1;
    sectionCounters.set(sectionId, localNumber);
    const questionnaireType = question.questionnaireType == null ? null : Number(question.questionnaireType);
    const type = scorerTypeForQuestion(primaryGroup.name, questionnaireType, localNumber);
    const assets = assetManifest(question, type);
    const promptHtml = leftSections.map(section => section?.textContent || '').filter(Boolean).join('\n') || null;
    const contextText = leftSections
      .map(section => cleanText(section?.textScript) || cleanText(section?.textContent))
      .filter(Boolean)
      .join('\n') || null;
    const canonicalContent = {
      questionId,
      questionnaireId: String(question.questionnaireId || questionnaire.id || ''),
      questionnaireType,
      scorerType: type,
      questionText: cleanText(details.content),
      promptText: leftSections.map(section => section?.title).filter(Boolean).join(' | ') || null,
      contextText,
      assets: stableAssetManifest(assets),
      timing: {
        preparationSeconds: details.fixedPreparationTime ?? null,
        recordingTime: details.recordingTime ?? null,
        breakTime: details.breakTime ?? null,
        wordCountLimit: details.wordCountLimit ?? null,
      },
    };
    return {
      sourceQuestionId: questionId,
      questionKey: questionId,
      sourceChooseId: question.questionChooseId ? String(question.questionChooseId) : null,
      sectionKey: sectionId,
      questionNumber: localNumber,
      globalNumber,
      scorerType: type,
      questionnaireType: canonicalContent.questionnaireType,
      title: String(questionnaire.name || primaryGroup.name || `Question ${localNumber}`),
      questionText: canonicalContent.questionText,
      promptText: canonicalContent.promptText,
      contextText: canonicalContent.contextText,
      promptHtml,
      assets,
      contentHash: sha256(canonicalContent),
      sourcePayload: {
        questionnaireId: canonicalContent.questionnaireId,
        timing: canonicalContent.timing,
      },
      scoreGroupKeys: matchingGroups.map(group => group.groupKey),
      answerText: question.studentRecordFileId && question.studentRecordFileId !== ZERO_UUID
        ? null
        : (question.studentAnswerText == null ? null : String(question.studentAnswerText)),
      studentAudioFileId: question.studentRecordFileId && question.studentRecordFileId !== ZERO_UUID
        ? String(question.studentRecordFileId)
        : null,
      sourceAnswer: {
        studentAnswerText: question.studentAnswerText ?? null,
        studentRecordFileId: question.studentRecordFileId ?? null,
      },
    };
  });

  if (new Set(questions.map(question => question.questionKey)).size !== questions.length) {
    throw new CanonicalizationError('IIG source snapshot contains duplicate question IDs.', 'IIG_QUESTION_ID_DUPLICATE');
  }

  const sections = sectionIds.map((sectionId, index) => {
    const sectionQuestions = questions.filter(question => question.sectionKey === sectionId);
    const isWriting = sectionQuestions.every(question => question.questionnaireType === 15);
    return {
      sourceSectionId: sectionId,
      sectionKey: sectionId,
      name: isWriting ? 'Writing' : 'Speaking',
      sectionType: isWriting ? 'WRITING' : 'SPEAKING',
      sortOrder: index,
    };
  });
  const structure = {
    schemaVersion: 1,
    sections,
    scoreGroups: groups.map(({ sourceSectionId, ...group }) => ({ ...group, sectionKey: sourceSectionId })),
    questions: questions.map(question => ({
      sectionKey: question.sectionKey,
      questionKey: question.questionKey,
      questionNumber: question.questionNumber,
      globalNumber: question.globalNumber,
      scorerType: question.scorerType,
      questionnaireType: question.questionnaireType,
      title: question.title,
      questionText: question.questionText,
      promptText: question.promptText,
      contextText: question.contextText,
      assets: stableAssetManifest(question.assets),
      contentHash: question.contentHash,
      scoreGroupKeys: question.scoreGroupKeys,
    })),
  };
  return {
    exam: {
      partner: 'IIG_ELEARNING',
      sourceMockTestId: String(info.mockTestId),
      title: String(info.mockTestName || info.name || '').trim() || null,
      sourceStatus: info.status == null ? null : String(info.status),
      structureHash: sha256(structure),
      structure,
    },
    sections,
    groups,
    questions,
    submission: {
      partner: 'IIG_ELEARNING',
      sourceScoringId: String(info.id || ''),
      keycode: String(info.keyCode || '').trim().toUpperCase(),
      candidateName: info.webUserName || null,
      candidateEmail: info.webUserEmail || null,
      candidatePhone: info.webUserPhone || null,
      sourceStatus: info.status == null ? null : String(info.status),
      submittedAt: info.submittedDate || null,
      sourceMetadata: {
        webUserId: info.webUserId || null,
        scoringDeadline: info.scoringDeadline || null,
      },
    },
  };
}

module.exports = {
  ZERO_UUID,
  CanonicalizationError,
  cleanText,
  imageUrls,
  stableAssetManifest,
  scorerType,
  scorerTypeForQuestion,
  questionDetails,
  canonicalizeSourcePayload,
};
