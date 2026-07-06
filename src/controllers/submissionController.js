const syncService = require('../services/syncService');
const db = require('../config/db');
const tokenManager = require('../services/tokenManager');
const iigClient = require('../clients/iigClient');


const submissionController = {
  /**
   * Triggers background batch sync for Keycode -> ID mappings using PageSize: 1000
   */
  async syncMappings(req, res) {
    try {
      const { pageSize, keyword, fromSubmittedDate, toSubmittedDate } = req.body;
      const parsedPageSize = parseInt(pageSize, 10) || 100;
      
      const count = await syncService.syncMappings({
        pageSize: parsedPageSize,
        keyword: keyword || null,
        fromSubmittedDate: fromSubmittedDate || null,
        toSubmittedDate: toSubmittedDate || null
      });
      
      return res.json({
        success: true,
        message: `Đồng bộ thành công ${count} keycode mapping từ hệ thống Elearning.`,
        count
      });
    } catch (error) {
      console.error('syncMappings Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Synchronizes full student answers for a specific Keycode
   */
  async syncSubmission(req, res) {
    const { keycode } = req.body;
    if (!keycode) {
      return res.status(400).json({ success: false, error: 'Keycode is required in request body.' });
    }

    try {
      const result = await syncService.syncSubmission(keycode);
      return res.json({
        success: true,
        message: `Successfully synchronized submission for keycode ${keycode.trim().toUpperCase()}`,
        data: result
      });
    } catch (error) {
      console.error(`syncSubmission (${keycode}) Error:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Retrieves list of synchronized student mocktest submissions
   */
  async listSubmissions(req, res) {
    const { keycode, studentName, status } = req.query;
    let queryText = 'SELECT * FROM mocktest_submissions WHERE deleted_at IS NULL';
    const params = [];
    let paramIndex = 1;

    if (keycode) {
      queryText += ` AND keycode ILIKE $${paramIndex}`;
      params.push(`%${keycode}%`);
      paramIndex++;
    }

    if (studentName) {
      queryText += ` AND student_name ILIKE $${paramIndex}`;
      params.push(`%${studentName}%`);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND status = $${paramIndex}`;
      params.push(parseInt(status, 10));
      paramIndex++;
    }

    queryText += ' ORDER BY COALESCE(synced_at, updated_at, submitted_date) DESC';

    try {
      const result = await db.query(queryText, params);
      return res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      console.error('listSubmissions Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Retrieves detailed submission information along with all 19 answers
   */
  async getSubmissionDetail(req, res) {
    const { id } = req.params; // courseScoringId
    
    try {
      // 1. Fetch submission info
      const subRes = await db.query('SELECT * FROM mocktest_submissions WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (subRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Submission not found locally.' });
      }

      const submission = subRes.rows[0];

      // 2. Fetch answers list (joined with ai_evaluation_results to get transcribe)
      const answersRes = await db.query(
        `SELECT sa.*, ai.transcribe 
         FROM submission_answers sa
         LEFT JOIN ai_evaluation_results ai ON sa.id = ai.answer_id
         WHERE sa.submission_id = $1 
         ORDER BY sa.section ASC, sa.question_no ASC`,
        [id]
      );

      return res.json({
        success: true,
        data: {
          ...submission,
          answers: answersRes.rows
        }
      });
    } catch (error) {
      console.error(`getSubmissionDetail (${id}) Error:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Dynamically resolves a file ID to a temporary S3 signed URL
   */
  async getFileUrl(req, res) {
    const { fileId } = req.params;
    try {
      const token = await tokenManager.ensureFreshToken();
      const tempUrl = await iigClient.getMigratedFileUrl(fileId, token);
      return res.json({ success: true, url: tempUrl });
    } catch (error) {
      console.error(`getFileUrl (${fileId}) Error:`, error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * List all keycode mappings
   */
  async listMappings(req, res) {
    try {
      const mappingsRes = await db.query(
        'SELECT keycode, course_scoring_id, student_name, test_name, created_at, updated_at FROM keycode_mappings ORDER BY updated_at DESC'
      );
      return res.json({ success: true, data: mappingsRes.rows });
    } catch (error) {
      console.error('List Mappings Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Create or update a mapping entry manually
   */
  async saveMapping(req, res) {
    const { keycode, courseScoringId, studentName, testName } = req.body;
    if (!keycode || !courseScoringId) {
      return res.status(400).json({ success: false, error: 'Keycode and Course Scoring ID are required.' });
    }

    const cleanKeycode = keycode.trim().toUpperCase();
    const cleanStudentName = studentName ? studentName.trim() : null;
    const cleanTestName = testName ? testName.trim() : null;

    try {
      const query = `
        INSERT INTO keycode_mappings (keycode, course_scoring_id, student_name, test_name, updated_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        ON CONFLICT (keycode) 
        DO UPDATE SET 
          course_scoring_id = EXCLUDED.course_scoring_id,
          student_name      = COALESCE(EXCLUDED.student_name, keycode_mappings.student_name),
          test_name         = COALESCE(EXCLUDED.test_name, keycode_mappings.test_name),
          updated_at        = CURRENT_TIMESTAMP
        RETURNING keycode, course_scoring_id, student_name, test_name
      `;
      const result = await db.query(query, [cleanKeycode, courseScoringId.trim(), cleanStudentName, cleanTestName]);
      
      // Update mocktest_submissions if exists
      if (cleanStudentName || cleanTestName) {
        await db.query(
          `UPDATE mocktest_submissions 
           SET student_name = COALESCE($1, student_name),
               test_name    = COALESCE($2, test_name),
               updated_at   = CURRENT_TIMESTAMP
           WHERE keycode = $3`,
          [cleanStudentName, cleanTestName, cleanKeycode]
        );
      }

      return res.json({
        success: true,
        message: `Successfully saved mapping for keycode ${cleanKeycode}`,
        data: result.rows[0]
      });
    } catch (error) {
      console.error('Save Mapping Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Delete a keycode mapping entry
   */
  async deleteMapping(req, res) {
    const { keycode } = req.params;
    try {
      const result = await db.query('DELETE FROM keycode_mappings WHERE keycode = $1 RETURNING keycode', [keycode.toUpperCase()]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Mapping not found.' });
      }
      return res.json({
        success: true,
        message: `Successfully deleted mapping for keycode ${keycode.toUpperCase()}`
      });
    } catch (error) {
      console.error('Delete Mapping Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Delete a mocktest submission and all its associated answers.
   * Validation: Only allows deletion if status is 1 (pending/not graded).
   */
  async deleteSubmission(req, res) {
    const { id } = req.params; // courseScoringId

    try {
      // 1. Fetch submission to validate status
      const subRes = await db.query(
        'SELECT status, keycode FROM mocktest_submissions WHERE id = $1',
        [id]
      );

      if (subRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Bài làm không tồn tại.' });
      }

      const submission = subRes.rows[0];

      // 2. Validate status: Only allow deletion if status is 1 (Pending/Not graded yet)
      // Status values: 1 = Pending/Waiting, other values like 5 = Graded
      if (parseInt(submission.status, 10) !== 1) {
        return res.status(400).json({ 
          success: false, 
          error: `Không thể xóa bài làm của keycode ${submission.keycode} vì bài thi đã được chấm điểm trên Elearning.` 
        });
      }

      // 3. Perform soft deletion (UPDATE deleted_at)
      await db.query('UPDATE mocktest_submissions SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);

      return res.json({
        success: true,
        message: `Đã xóa bài làm của keycode ${submission.keycode} thành công khỏi hệ thống.`
      });
    } catch (error) {
      console.error('Delete Submission Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Bulk delete multiple mocktest submissions.
   * Validation: Filters and deletes only those with status = 1 (pending/not graded yet).
   */
  async bulkDeleteSubmissions(req, res) {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách ID bài làm cần xóa không hợp lệ.' });
    }

    try {
      // 1. Query to find which IDs are actually status = 1
      const query = `
        SELECT id, keycode, status 
        FROM mocktest_submissions 
        WHERE id = ANY($1)
      `;
      const result = await db.query(query, [ids]);
      const rows = result.rows;

      const pendingIds = rows.filter(r => parseInt(r.status, 10) === 1).map(r => r.id);
      const gradedCount = rows.length - pendingIds.length;

      if (pendingIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          error: `Không có bài làm nào chưa chấm được tìm thấy trong danh sách đã chọn. (${gradedCount} bài đã được chấm điểm không thể xóa).` 
        });
      }

      // 2. Perform soft delete (UPDATE deleted_at)
      await db.query('UPDATE mocktest_submissions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ANY($1)', [pendingIds]);

      let message = `Đã xóa thành công ${pendingIds.length} bài làm chưa chấm khỏi hệ thống.`;
      if (gradedCount > 0) {
        message += ` Bỏ qua ${gradedCount} bài làm đã được chấm điểm.`;
      }

      return res.json({
        success: true,
        message,
        deletedCount: pendingIds.length,
        skippedCount: gradedCount
      });
    } catch (error) {
      console.error('Bulk Delete Submissions Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Triggers Speech or Writing evaluation through dynamic AI Agent, updates DB and updates answer status to scored.
   */
  async gradeAnswerWithAI(req, res) {
    const { answerId, agentId } = req.body;
    if (!answerId) {
      return res.status(400).json({ success: false, error: 'answerId is required.' });
    }

    const requestSentAt = new Date();
    try {
      // 1. Fetch the AI Agent configuration
      let agent;
      if (agentId) {
        const agentRes = await db.query('SELECT * FROM ai_agents WHERE id = $1', [agentId]);
        if (agentRes.rows.length > 0) agent = agentRes.rows[0];
      }
      
      if (!agent) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy Agent cấu hình chấm điểm tương ứng.' });
      }

      // 2. Fetch the answer information
      const answerRes = await db.query(
        'SELECT * FROM submission_answers WHERE id = $1',
        [answerId]
      );
      if (answerRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy câu trả lời.' });
      }

      const answer = answerRes.rows[0];
      let difyResult;
      const dynamicDifyClient = require('../clients/dynamicDifyClient');

      if (answer.section === 'Speaking') {
        if (!answer.student_audio_file_id) {
          return res.status(400).json({ success: false, error: 'Câu trả lời thiếu file ghi âm.' });
        }
        // Resolve audio file ID into temporary URL via IIG Client
        const token = await tokenManager.ensureFreshToken();
        const audioUrl = await iigClient.getMigratedFileUrl(answer.student_audio_file_id, token);
        if (!audioUrl) {
          return res.status(404).json({ success: false, error: 'Không thể giải quyết URL tệp ghi âm từ IIG.' });
        }

        // Call Dynamic Speech Evaluation
        difyResult = await dynamicDifyClient.evaluateSpeech(agent.api_endpoint, agent.api_key, audioUrl, answer.prompt_text);
      } else {
        // Writing Section evaluation
        difyResult = await dynamicDifyClient.evaluateWriting(
          agent.api_endpoint, 
          agent.api_key, 
          answer.student_writing || '', 
          answer.prompt_text || '', 
          answer.question_name || ''
        );
      }

      const responseReceivedAt = new Date();

      // Dify Workflow returns object in data.outputs
      const outputs = difyResult.data?.outputs || {};
      let transcribe = outputs.transcribe || outputs.text || '';
      let finalScore = outputs.final_score || null;
      let parsedEvaluation = {};

      if (outputs.result) {
        try {
          const rawText = outputs.result;
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedEvaluation = JSON.parse(jsonMatch[0]);
          }
          if (parsedEvaluation.transcribe) transcribe = parsedEvaluation.transcribe;
          if (parsedEvaluation.final_score) finalScore = parsedEvaluation.final_score;
        } catch (e) {
          console.warn('Failed parsing Dify outputs.result:', e);
        }
      }

      if (!transcribe && answer.section === 'Speaking') {
        transcribe = typeof outputs === 'object' ? JSON.stringify(outputs) : String(outputs);
      }

      const pronunciationScore = parsedEvaluation.pronunciation_score || null;
      const pronunciationRationale = parsedEvaluation.pronunciation_rationale || null;
      const intonationScore = parsedEvaluation.intonation_score || null;
      const intonationRationale = parsedEvaluation.intonation_rationale || null;
      const errorsList = parsedEvaluation.errors ? JSON.stringify(parsedEvaluation.errors) : '[]';
      const overall1 = parsedEvaluation.overall_1 || null;
      const overall2 = parsedEvaluation.overall_2 || null;
      const keyErrors = parsedEvaluation.key_errors || null;
      const strength = parsedEvaluation.strength || null;
      const weakness = parsedEvaluation.weakness || null;
      const improvement = parsedEvaluation.improvement || null;

      // Upsert into evaluation results table
      await db.query(
        `INSERT INTO ai_evaluation_results (
          answer_id, request_sent_at, response_received_at, transcribe, final_score, 
          pronunciation_score, pronunciation_rationale, intonation_score, intonation_rationale, 
          errors, overall_1, overall_2, key_errors, strength, weakness, improvement, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
         ON CONFLICT (answer_id) 
         DO UPDATE SET 
           request_sent_at = EXCLUDED.request_sent_at,
           response_received_at = EXCLUDED.response_received_at,
           transcribe = COALESCE(EXCLUDED.transcribe, ai_evaluation_results.transcribe),
           final_score = EXCLUDED.final_score,
           pronunciation_score = EXCLUDED.pronunciation_score,
           pronunciation_rationale = EXCLUDED.pronunciation_rationale,
           intonation_score = EXCLUDED.intonation_score,
           intonation_rationale = EXCLUDED.intonation_rationale,
           errors = EXCLUDED.errors,
           overall_1 = EXCLUDED.overall_1,
           overall_2 = EXCLUDED.overall_2,
           key_errors = EXCLUDED.key_errors,
           strength = EXCLUDED.strength,
           weakness = EXCLUDED.weakness,
           improvement = EXCLUDED.improvement,
           updated_at = CURRENT_TIMESTAMP`,
        [
          answerId, requestSentAt, responseReceivedAt, transcribe, finalScore,
          pronunciationScore, pronunciationRationale, intonationScore, intonationRationale,
          errorsList, overall1, overall2, keyErrors, strength, weakness, improvement
        ]
      );

      // 5. Update answer status in submission_answers to 'scored'
      await db.query(
        'UPDATE submission_answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['scored', answerId]
      );

      return res.json({
        success: true,
        message: 'Chấm điểm AI hoàn tất thành công.',
        data: {
          answerId,
          transcribe,
          finalScore
        }
      });
    } catch (error) {
      console.error('gradeAnswerWithAI Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Dedicated STT Transcribe API through dynamic AI Agent.
   */
  async transcribeAnswerWithAI(req, res) {
    const { answerId, agentId } = req.body;
    if (!answerId) {
      return res.status(400).json({ success: false, error: 'answerId is required.' });
    }

    const requestSentAt = new Date();
    try {
      // 1. Fetch AI Agent
      let agent;
      if (agentId) {
        const agentRes = await db.query('SELECT * FROM ai_agents WHERE id = $1', [agentId]);
        if (agentRes.rows.length > 0) agent = agentRes.rows[0];
      }

      if (!agent) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy Agent cấu hình Transcribe tương ứng.' });
      }

      // 2. Fetch the answer details
      const answerRes = await db.query(
        'SELECT * FROM submission_answers WHERE id = $1',
        [answerId]
      );
      if (answerRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy câu trả lời.' });
      }

      const answer = answerRes.rows[0];
      if (!answer.student_audio_file_id) {
        return res.status(400).json({ success: false, error: 'Câu trả lời thiếu file ghi âm.' });
      }

      // 3. Resolve temporary URL via IIG client
      const token = await tokenManager.ensureFreshToken();
      const audioUrl = await iigClient.getMigratedFileUrl(answer.student_audio_file_id, token);
      if (!audioUrl) {
        return res.status(404).json({ success: false, error: 'Không thể giải quyết URL tệp ghi âm từ IIG.' });
      }

      // 4. Send speech-to-text request to dynamic Agent
      const dynamicDifyClient = require('../clients/dynamicDifyClient');
      const difyResult = await dynamicDifyClient.evaluateSpeech(agent.api_endpoint, agent.api_key, audioUrl, answer.prompt_text || '');

      const responseReceivedAt = new Date();
      const outputs = difyResult.data?.outputs || {};

      // Get STT result text
      let transcribe = outputs.transcribe || outputs.text || '';
      if (outputs.result) {
        try {
          const jsonMatch = outputs.result.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.transcribe) transcribe = parsed.transcribe;
          }
        } catch (e) {
          // ignore
        }
      }

      if (!transcribe) {
        transcribe = typeof outputs === 'object' ? JSON.stringify(outputs) : String(outputs);
      }

      // 5. Save transcription to DB
      await db.query(
        `INSERT INTO ai_evaluation_results (
          answer_id, request_sent_at, response_received_at, transcribe, updated_at
         ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (answer_id) 
         DO UPDATE SET 
           request_sent_at = EXCLUDED.request_sent_at,
           response_received_at = EXCLUDED.response_received_at,
           transcribe = EXCLUDED.transcribe,
           updated_at = CURRENT_TIMESTAMP`,
        [answerId, requestSentAt, responseReceivedAt, transcribe]
      );

      return res.json({
        success: true,
        message: 'Dịch giọng nói (STT) hoàn tất.',
        data: {
          answerId,
          transcribe
        }
      });
    } catch (error) {
      console.error('transcribeAnswerWithAI Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = submissionController;
