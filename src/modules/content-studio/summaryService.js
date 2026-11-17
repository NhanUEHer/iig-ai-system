'use strict';

const db = require('../../config/db');

const STATUS_PRIORITY = {
  ready: 1,
  needs_review: 2,
  waiting_review: 3,
  generating: 4,
  failed: 5,
};

const TASK_ARTIFACT_TYPES = {
  vocab: 'vocab',
  dictionary: 'dictionary',
  translation: 'passage_translation',
  questions: 'question_pack',
};

function normalizeStatus(status) {
  if (status === 'queued') return 'generating';
  if (status === 'draft') return 'waiting_review';
  return Object.hasOwn(STATUS_PRIORITY, status) ? status : null;
}

function rollupStatus(statuses = []) {
  return statuses.map(normalizeStatus).filter(Boolean).reduce((worst, status) => (
    !worst || STATUS_PRIORITY[status] > STATUS_PRIORITY[worst] ? status : worst
  ), null);
}

function requestedTasks(tasks = {}) {
  const passage = Array.isArray(tasks?.passage) ? tasks.passage : [];
  const question = Array.isArray(tasks?.question) ? tasks.question : [];
  return {
    vocab: passage.includes('vocab'),
    dictionary: passage.includes('dictionary'),
    translation: passage.includes('translation'),
    questions: question.length > 0,
  };
}

function deriveTaskStatus(tasks, artifacts = [], { dictionaryStatus } = {}) {
  const requested = requestedTasks(tasks);
  const byType = artifacts.reduce((result, artifact) => {
    if (artifact?.type) (result[artifact.type] ||= []).push(artifact.status);
    return result;
  }, {});

  return Object.fromEntries(Object.entries(TASK_ARTIFACT_TYPES).map(([task, type]) => {
    if (!requested[task]) return [task, null];
    if (task === 'dictionary' && dictionaryStatus !== undefined) return [task, normalizeStatus(dictionaryStatus)];
    return [task, rollupStatus(byType[type])];
  }));
}

function deriveNextAction(taskStatus = {}) {
  if (['waiting_review', 'draft'].includes(taskStatus.dictionary)) {
    return { nextAction: 'review_dictionary', nextLabel: 'Duyệt danh sách từ' };
  }
  if (Object.values(taskStatus).some(status => status === 'failed' || status === 'needs_review')) {
    return { nextAction: 'review', nextLabel: 'Xem lại' };
  }
  return { nextAction: 'open', nextLabel: 'Mở' };
}

function decorateItem(row) {
  const taskStatus = deriveTaskStatus(row.tasks, row._artifacts || [], { dictionaryStatus: row._dictionaryStatus });
  const { nextAction, nextLabel } = deriveNextAction(taskStatus);
  const { _artifacts, _dictionaryStatus, ...item } = row;
  return { ...item, taskStatus, nextAction, nextLabel };
}

function deriveKind(header) {
  const match = String(header || '').match(/following\s+([a-z][a-z\- ]*?)(?:\s+and\s+[a-z\- ]+)?\s*\.?$/i);
  if (!match) return 'passage';
  return match[1].trim().toLowerCase().replace('e-mail', 'email');
}

function buildFolderPath(folderId, foldersById) {
  const path = [];
  const seen = new Set();
  let current = folderId ? foldersById.get(folderId) : null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId ? foldersById.get(current.parentId) : null;
  }
  return path;
}

function itemFlags(item) {
  const statuses = Object.values(item.taskStatus || {}).filter(Boolean);
  return {
    pendingReview: item.taskStatus?.dictionary === 'waiting_review',
    needsReview: statuses.includes('needs_review'),
    failed: statuses.includes('failed'),
    ready: statuses.length > 0 && statuses.every(status => status === 'ready'),
  };
}

const ARTIFACTS_SQL = `COALESCE((
  SELECT jsonb_agg(jsonb_build_object('type', a.type, 'status', a.status))
  FROM cs_artifacts a WHERE a.item_id = i.id
), '[]'::jsonb)`;

const DICTIONARY_STATUS_SQL = `(CASE
  WHEN NOT EXISTS (SELECT 1 FROM cs_dict_sentences ds WHERE ds.item_id = i.id) THEN NULL
  WHEN EXISTS (SELECT 1 FROM cs_dict_sentences ds WHERE ds.item_id = i.id AND ds.status = 'failed')
    OR EXISTS (SELECT 1 FROM cs_dict_candidates dc WHERE dc.item_id = i.id AND dc.status = 'failed') THEN 'failed'
  WHEN EXISTS (SELECT 1 FROM cs_dict_sentences ds WHERE ds.item_id = i.id AND ds.status IN ('queued','generating'))
    OR EXISTS (SELECT 1 FROM cs_dict_candidates dc WHERE dc.item_id = i.id AND dc.status IN ('queued','generating')) THEN 'generating'
  WHEN EXISTS (SELECT 1 FROM cs_dict_sentences ds WHERE ds.item_id = i.id AND ds.status = 'draft')
    OR EXISTS (SELECT 1 FROM cs_dict_candidates dc WHERE dc.item_id = i.id AND dc.status = 'draft') THEN 'draft'
  WHEN EXISTS (SELECT 1 FROM cs_dict_sentences ds WHERE ds.item_id = i.id AND ds.status = 'needs_review')
    OR EXISTS (SELECT 1 FROM cs_dict_candidates dc WHERE dc.item_id = i.id AND dc.status = 'needs_review') THEN 'needs_review'
  WHEN EXISTS (SELECT 1 FROM cs_dict_candidates dc WHERE dc.item_id = i.id) THEN 'ready'
  ELSE 'draft' END)`;

async function loadSummaryItems({ limit } = {}) {
  const params = [];
  let limitSql = '';
  if (limit !== undefined) {
    params.push(Math.min(Math.max(Number(limit) || 5, 1), 50));
    limitSql = 'LIMIT $1';
  }
  const { rows } = await db.query(`
    SELECT i.id, i.folder_id AS "folderId", i.title, i.tasks,
           i.detection->'summary'->'questionRange' AS "questionRange",
           (SELECT (s.meta->>'part')::int FROM cs_segments s
            WHERE s.item_id = i.id AND s.kind = 'question_set' AND s.meta->>'part' IS NOT NULL
            ORDER BY s.position LIMIT 1) AS part,
           (SELECT s.meta->>'header' FROM cs_segments s
            WHERE s.item_id = i.id AND s.meta->>'header' IS NOT NULL
            ORDER BY s.position LIMIT 1) AS "documentHeader",
           i.updated_at AS "updatedAt", ${ARTIFACTS_SQL} AS "_artifacts",
           ${DICTIONARY_STATUS_SQL} AS "_dictionaryStatus"
    FROM cs_items i ORDER BY i.updated_at DESC ${limitSql}`, params);
  return rows.map(decorateItem);
}

async function loadFolders() {
  const { rows } = await db.query(`
    SELECT id, parent_id AS "parentId", name, sort_order AS "sortOrder",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM cs_folders ORDER BY sort_order, name`);
  return rows;
}

async function folderSummary() {
  const [folders, items, unfiled] = await Promise.all([
    loadFolders(),
    loadSummaryItems(),
    db.query('SELECT COUNT(*)::int AS count FROM cs_items WHERE folder_id IS NULL'),
  ]);
  const childrenByParent = new Map();
  for (const folder of folders) {
    const key = folder.parentId || null;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key).push(folder);
  }

  const subtreeIds = folder => {
    const ids = [folder.id];
    for (const child of childrenByParent.get(folder.id) || []) ids.push(...subtreeIds(child));
    return ids;
  };
  const summarize = folder => {
    const ids = new Set(subtreeIds(folder));
    const subtreeItems = items.filter(item => ids.has(item.folderId));
    const subtreeFolders = folders.filter(candidate => ids.has(candidate.id));
    const flags = subtreeItems.map(itemFlags);
    const dates = [...subtreeFolders.map(candidate => candidate.updatedAt), ...subtreeItems.map(item => item.updatedAt)]
      .filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
    return {
      id: folder.id,
      name: folder.name,
      itemCount: subtreeItems.length,
      children: (childrenByParent.get(folder.id) || []).map(child => ({
        id: child.id,
        name: child.name,
        itemCount: items.filter(item => new Set(subtreeIds(child)).has(item.folderId)).length,
      })),
      pendingReview: flags.filter(flag => flag.pendingReview).length,
      needsReview: flags.filter(flag => flag.needsReview).length,
      failed: flags.filter(flag => flag.failed).length,
      readyCount: flags.filter(flag => flag.ready).length,
      updatedAt: dates.length ? new Date(Math.max(...dates)) : folder.updatedAt,
    };
  };

  return { folders: (childrenByParent.get(null) || []).map(summarize), unfiledCount: unfiled.rows[0].count };
}

async function recentItems({ limit = 5 } = {}) {
  const [items, folders] = await Promise.all([loadSummaryItems({ limit }), loadFolders()]);
  const foldersById = new Map(folders.map(folder => [folder.id, folder]));
  return items.map(item => ({
    id: item.id,
    title: item.title,
    folderPath: buildFolderPath(item.folderId, foldersById),
    part: item.part,
    questionRange: item.questionRange,
    kind: deriveKind(item.documentHeader),
    updatedAt: item.updatedAt,
    taskStatus: item.taskStatus,
    nextAction: item.nextAction,
    nextLabel: item.nextLabel,
  }));
}

async function attention() {
  const items = await loadSummaryItems();
  const flags = items.map(itemFlags);
  const dictionaryPending = flags.filter(flag => flag.pendingReview).length;
  const needsReview = flags.filter(flag => flag.needsReview).length;
  const total = flags.filter(flag => flag.pendingReview || flag.needsReview).length;
  return { dictionaryPending, needsReview, total };
}

module.exports = {
  attention,
  decorateItem,
  deriveNextAction,
  deriveTaskStatus,
  DICTIONARY_STATUS_SQL,
  folderSummary,
  recentItems,
  rollupStatus,
};
