const express = require('express');
const router = express.Router();
const db = require('../config/db');

// List all agents
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ai_agents ORDER BY id DESC');
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('List Agents Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Create new agent
router.post('/', async (req, res) => {
  const { name, description, api_endpoint, api_key, api_type, target_questions, stt_target } = req.body;
  if (!name || !api_endpoint || !api_key || !api_type || !target_questions) {
    return res.status(400).json({ success: false, error: 'Thiếu các thông tin bắt buộc.' });
  }

  // Validate constraint: Transcribe can only select Speaking questions
  if (api_type === 'STT') {
    const hasWriting = target_questions.some(q => q.startsWith('w_'));
    if (hasWriting) {
      return res.status(400).json({ success: false, error: 'Agent loại Transcribe (STT) chỉ được chọn các nhóm câu hỏi Speaking.' });
    }
  }

  try {
    const query = `
      INSERT INTO ai_agents (name, description, api_endpoint, api_key, api_type, stt_target, target_questions, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    const result = await db.query(query, [
      name,
      description || null,
      api_endpoint.trim(),
      api_key.trim(),
      api_type,
      stt_target || 'student_answer',
      JSON.stringify(target_questions)
    ]);
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create Agent Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update agent
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, api_endpoint, api_key, api_type, target_questions, stt_target } = req.body;

  if (!name || !api_endpoint || !api_key || !api_type || !target_questions) {
    return res.status(400).json({ success: false, error: 'Thiếu các thông tin bắt buộc.' });
  }

  // Validate constraint
  if (api_type === 'STT') {
    const hasWriting = target_questions.some(q => q.startsWith('w_'));
    if (hasWriting) {
      return res.status(400).json({ success: false, error: 'Agent loại Transcribe (STT) chỉ được chọn các nhóm câu hỏi Speaking.' });
    }
  }

  try {
    const query = `
      UPDATE ai_agents 
      SET name = $1, description = $2, api_endpoint = $3, api_key = $4, api_type = $5, stt_target = $6, target_questions = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `;
    const result = await db.query(query, [
      name,
      description || null,
      api_endpoint.trim(),
      api_key.trim(),
      api_type,
      stt_target || 'student_answer',
      JSON.stringify(target_questions),
      id
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy Agent.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update Agent Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Delete agent
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM ai_agents WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy Agent.' });
    }
    return res.json({ success: true, message: 'Xóa Agent thành công.' });
  } catch (error) {
    console.error('Delete Agent Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
