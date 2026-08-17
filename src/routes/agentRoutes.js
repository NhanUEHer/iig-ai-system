const express = require('express');
const axios = require('axios');
const db = require('../config/db');
const asyncHandler = require('../http/asyncHandler');
const HttpError = require('../http/httpError');
const { requirePermission } = require('../middleware/authenticate');

const router = express.Router();
const API_TYPES = new Set(['Grading', 'STT', 'Gen Key Vocab', 'Gen Dictionary']);
const CONTENT_API_TYPES = new Set(['Gen Key Vocab', 'Gen Dictionary']);
const STT_TARGETS = new Set(['student_answer', 'question', 'context']);
const QUESTION_GROUPS = new Set(['sp_read_aloud', 'sp_describe_pic', 'sp_respond_q', 'sp_respond_info', 'sp_opinion', 'w_picture', 'w_email', 'w_text']);
const MASKED_KEY = '••••••••••••';

function publicAgent(row) {
  if (!row) return row;
  return { ...row, api_key: undefined, has_api_key: Boolean(row.api_key) };
}

function normalizeEndpoint(value) {
  let url;
  try { url = new URL(String(value || '').trim()); }
  catch { throw new HttpError('API endpoint phải là URL HTTP/HTTPS hợp lệ.', 400, 'INVALID_ENDPOINT'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError('API endpoint phải sử dụng HTTP hoặc HTTPS.', 400, 'INVALID_ENDPOINT');
  return url.toString().replace(/\/$/, '').replace(/\/workflows\/run$/, '');
}

function validate(body, { existingKey = false } = {}) {
  const name = String(body.name || '').trim();
  const apiType = body.api_type;
  const targetQuestions = [...new Set(Array.isArray(body.target_questions) ? body.target_questions : [])];
  const sttTarget = apiType === 'STT' ? body.stt_target || 'student_answer' : 'student_answer';
  if (!name || !API_TYPES.has(apiType)) throw new HttpError('Vui lòng nhập tên và loại Agent.', 400, 'VALIDATION_ERROR');
  if (!CONTENT_API_TYPES.has(apiType) && !targetQuestions.length) throw new HttpError('Vui lòng chọn ít nhất một nhóm câu hỏi.', 400, 'VALIDATION_ERROR');
  if (!targetQuestions.every(item => QUESTION_GROUPS.has(item))) throw new HttpError('Danh sách nhóm câu hỏi chứa giá trị không hợp lệ.', 400, 'VALIDATION_ERROR');
  if (apiType === 'STT' && !STT_TARGETS.has(sttTarget)) throw new HttpError('Đích STT không hợp lệ.', 400, 'VALIDATION_ERROR');
  if (apiType === 'STT' && targetQuestions.some(item => item.startsWith('w_'))) throw new HttpError('Agent STT chỉ áp dụng cho nhóm Speaking.', 400, 'VALIDATION_ERROR');
  const apiKey = String(body.api_key || '').trim();
  if (!existingKey && (!apiKey || apiKey === MASKED_KEY)) throw new HttpError('API key là bắt buộc.', 400, 'VALIDATION_ERROR');
  return { name, description: String(body.description || '').trim() || null, apiEndpoint: normalizeEndpoint(body.api_endpoint), apiKey, apiType, sttTarget, targetQuestions: CONTENT_API_TYPES.has(apiType) ? [] : targetQuestions };
}

router.get('/', requirePermission('agents.view'), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const search = `%${String(req.query.search || '').trim()}%`;
  const apiType = API_TYPES.has(req.query.type) ? req.query.type : null;
  const params = [search];
  let where = `(name ILIKE $1 OR COALESCE(description,'') ILIKE $1 OR api_endpoint ILIKE $1)`;
  if (apiType) { params.push(apiType); where += ` AND api_type = $${params.length}`; }
  const [result, count] = await Promise.all([
    db.query(`SELECT * FROM ai_agents WHERE ${where} ORDER BY api_type, stt_target, name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, (page - 1) * limit]),
    db.query(`SELECT COUNT(*)::int AS total FROM ai_agents WHERE ${where}`, params)
  ]);
  const total = count.rows[0]?.total || 0;
  return res.json({ success: true, data: result.rows.map(publicAgent), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.post('/test-connection', requirePermission('agents.manage'), asyncHandler(async (req, res) => {
  const endpoint = normalizeEndpoint(req.body.api_endpoint);
  const apiKey = String(req.body.api_key || '').trim();
  if (!apiKey || apiKey === MASKED_KEY) throw new HttpError('Nhập API key mới để kiểm tra kết nối.', 400, 'VALIDATION_ERROR');
  const startedAt = Date.now();
  await axios.get(`${endpoint}/info`, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 10000 });
  return res.json({ success: true, message: 'Kết nối Dify thành công.', data: { latencyMs: Date.now() - startedAt } });
}));

router.post('/', requirePermission('agents.manage'), asyncHandler(async (req, res) => {
  const value = validate(req.body);
  const duplicate = CONTENT_API_TYPES.has(value.apiType)
    ? await db.query('SELECT id FROM ai_agents WHERE api_type = $1 LIMIT 1', [value.apiType])
    : await db.query(
      `SELECT id FROM ai_agents WHERE api_type = $1 AND stt_target = $2 AND target_questions ?| $3::text[] LIMIT 1`,
      [value.apiType, value.sttTarget, value.targetQuestions]
    );
  if (duplicate.rows.length) throw new HttpError(CONTENT_API_TYPES.has(value.apiType) ? 'Mỗi loại học liệu chỉ được có một Agent hoạt động.' : 'Đã có Agent cùng loại/đích phụ trách một trong các nhóm câu hỏi này.', 409, 'AGENT_CONFLICT');
  const result = await db.query(
    `INSERT INTO ai_agents (name, description, api_endpoint, api_key, api_type, stt_target, target_questions, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP) RETURNING *`,
    [value.name, value.description, value.apiEndpoint, value.apiKey, value.apiType, value.sttTarget, JSON.stringify(value.targetQuestions)]
  );
  return res.status(201).json({ success: true, data: publicAgent(result.rows[0]) });
}));

router.put('/:id', requirePermission('agents.manage'), asyncHandler(async (req, res) => {
  const existing = await db.query('SELECT * FROM ai_agents WHERE id = $1', [req.params.id]);
  if (!existing.rows[0]) throw new HttpError('Không tìm thấy Agent.', 404, 'AGENT_NOT_FOUND');
  const value = validate(req.body, { existingKey: true });
  const duplicate = CONTENT_API_TYPES.has(value.apiType)
    ? await db.query('SELECT id FROM ai_agents WHERE id <> $1 AND api_type = $2 LIMIT 1', [req.params.id, value.apiType])
    : await db.query(
      `SELECT id FROM ai_agents WHERE id <> $1 AND api_type = $2 AND stt_target = $3 AND target_questions ?| $4::text[] LIMIT 1`,
      [req.params.id, value.apiType, value.sttTarget, value.targetQuestions]
    );
  if (duplicate.rows.length) throw new HttpError('Một Agent khác đã phụ trách nhóm câu hỏi trùng cấu hình.', 409, 'AGENT_CONFLICT');
  const apiKey = value.apiKey && value.apiKey !== MASKED_KEY ? value.apiKey : existing.rows[0].api_key;
  const result = await db.query(
    `UPDATE ai_agents SET name=$1,description=$2,api_endpoint=$3,api_key=$4,api_type=$5,stt_target=$6,target_questions=$7,updated_at=CURRENT_TIMESTAMP WHERE id=$8 RETURNING *`,
    [value.name, value.description, value.apiEndpoint, apiKey, value.apiType, value.sttTarget, JSON.stringify(value.targetQuestions), req.params.id]
  );
  return res.json({ success: true, data: publicAgent(result.rows[0]) });
}));

router.delete('/:id', requirePermission('agents.manage'), asyncHandler(async (req, res) => {
  const result = await db.query('DELETE FROM ai_agents WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows.length) throw new HttpError('Không tìm thấy Agent.', 404, 'AGENT_NOT_FOUND');
  return res.json({ success: true, message: 'Đã xóa Agent.' });
}));

module.exports = router;
