const syncService = require('../services/syncService');
const db = require('../config/db');
const tokenManager = require('../services/tokenManager');
const iigClient = require('../clients/iigClient');

async function refreshSubmissionStatus(submissionId) {
  try {
    const countsRes = await db.query(
      `SELECT status, COUNT(*) as cnt 
       FROM submission_answers 
       WHERE submission_id = $1 
       GROUP BY status`,
      [submissionId]
    );

    let hasPending = false;
    let hasScoring = false;
    let hasScored = false;

    countsRes.rows.forEach(r => {
      const cnt = parseInt(r.cnt, 10);
      if (cnt > 0) {
        if (r.status === 'pending') hasPending = true;
        if (r.status === 'scoring') hasScoring = true;
        if (r.status === 'scored' || r.status === 'error') hasScored = true;
      }
    });

    let newStatus = 1; // Default: Chưa chấm (1)
    if (hasScoring) {
      newStatus = 2; // Đang chấm (2)
    } else if (hasScored && hasPending) {
      newStatus = 2; // Đang chấm (2)
    } else if (hasScored && !hasPending) {
      newStatus = 3; // Đã chấm (3)
    }

    await db.query(
      'UPDATE mocktest_submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newStatus, submissionId]
    );
    console.log(`[Status Sync] Updated Submission ${submissionId} status to ${newStatus}`);
  } catch (err) {
    console.error('refreshSubmissionStatus Error:', err);
  }
}

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

      const answersRes = await db.query(
        `SELECT sa.*, 
                ai.transcribe, ai.final_score, ai.pronunciation_score, ai.pronunciation_rationale, 
                ai.intonation_score, ai.intonation_rationale, 
                ai.cohesion_score, ai.cohesion_rationale, 
                ai.grammar_score, ai.grammar_rationale, 
                ai.vocabulary_score, ai.vocabulary_rationale,
                ai.completeness_score, ai.completeness_rationale,
                ai.relevance_score, ai.relevance_rationale,
                ai.errors, ai.overall_1, ai.overall_2, 
                ai.key_errors, ai.strength, ai.weakness, ai.improvement, ai.cleaned_audio_url
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

      // 2. Fetch the answer information
      const answerRes = await db.query(
        'SELECT * FROM submission_answers WHERE id = $1',
        [answerId]
      );
      if (answerRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy câu trả lời.' });
      }

      const answer = answerRes.rows[0];

      // Auto-resolve agent if not provided
      if (!agent) {
        const qNo = parseInt(answer.question_no, 10);
        let qTypeKey = '';
        if (answer.section === 'Speaking') {
          if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
          else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
          else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
          else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
          else qTypeKey = 'sp_opinion';
        } else if (answer.section === 'Writing') {
          if (qNo <= 5) qTypeKey = 'w_picture';
          else if (qNo <= 7) qTypeKey = 'w_email';
          else qTypeKey = 'w_text';
        }

        if (qTypeKey) {
          const agentRes = await db.query(
            "SELECT * FROM ai_agents WHERE api_type = 'Grading' AND target_questions ? $1 LIMIT 1",
            [qTypeKey]
          );
          if (agentRes.rows.length > 0) {
            agent = agentRes.rows[0];
          }
        }
      }

      if (!agent) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy Agent cấu hình chấm điểm tương ứng.' });
      }

      // Set status to 'scoring' in submission_answers table immediately for parent status synchronization
      await db.query(
        'UPDATE submission_answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['scoring', answerId]
      );
      await refreshSubmissionStatus(answer.submission_id);

      let difyResult;
      const dynamicDifyClient = require('../clients/dynamicDifyClient');

      if (answer.section === 'Speaking') {
        // Resolve audio URL: Use cleaned audio if exists, otherwise fallback to IIG original audio
        const evalRes = await db.query(
          'SELECT cleaned_audio_url, transcribe FROM ai_evaluation_results WHERE answer_id = $1',
          [answerId]
        );
        let audioUrl = evalRes.rows[0]?.cleaned_audio_url;
        let existingTranscribe = evalRes.rows[0]?.transcribe || '';

        // Handle remote Dify download constraint for local cleaned files:
        // If cleaned audio is a localhost URL, replace it with PUBLIC_URL from .env.
        // If no PUBLIC_URL is configured, fall back to IIG public URL so it does not fail with 400.
        // If it is an R2 key (starts with "r2:"), generate a pre-signed URL.
        const storageService = require('../services/storageService');
        if (audioUrl && storageService.isR2Key(audioUrl)) {
          try {
            audioUrl = await storageService.getSignedAudioUrl(audioUrl);
            console.log(`[Grading] Resolved R2 pre-signed URL for Dify.`);
          } catch (r2Err) {
            console.warn(`[Grading] R2 pre-signed URL failed: ${r2Err.message}`);
            audioUrl = null;
          }
        }
        const isLocalhost = audioUrl && (audioUrl.includes('localhost') || audioUrl.includes('127.0.0.1'));
        if (isLocalhost) {
          if (process.env.PUBLIC_URL) {
            audioUrl = audioUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/, process.env.PUBLIC_URL);
            console.log(`[Grading] Replaced localhost with public URL: ${audioUrl}`);
          } else {
            console.warn(`[Grading] Warning: Remote Dify cannot reach localhost cleaned audio. Falling back to public IIG audio url.`);
            audioUrl = null; // Forces fallback to original public IIG URL below
          }
        }

        if (!audioUrl && answer.student_audio_file_id) {
          try {
            const token = await tokenManager.ensureFreshToken();
            audioUrl = await iigClient.getMigratedFileUrl(answer.student_audio_file_id, token);
          } catch (e) {
            console.error('[Grading] Failed to resolve student audio URL:', e.message);
          }
        }

        if (!audioUrl) {
          // Use a public 1-second silent audio file URL so Dify parameter type checks don't return 400 Bad Request
          audioUrl = 'https://github.com/anars/blank-audio/raw/master/1-second-of-silence.mp3';
        }

        const qNo = parseInt(answer.question_no, 10);
        let qTypeKey = '';
        if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
        else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
        else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
        else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
        else qTypeKey = 'sp_opinion';

        // 1. Auto-transcribe context audio if context_text is missing
        if (answer.context_audio_file_id && (!answer.context_text || !answer.context_text.trim())) {
          console.log(`[Grading] context_text missing for Answer ID: ${answerId}. Auto-triggering context STT...`);
          const contextSttRes = await db.query(
            "SELECT * FROM ai_agents WHERE api_type = 'STT' AND stt_target = 'context' AND target_questions ? $1 LIMIT 1",
            [qTypeKey]
          );
          if (contextSttRes.rows.length > 0) {
            const contextAgent = contextSttRes.rows[0];
            try {
              const token = await tokenManager.ensureFreshToken();
              const contextAudioUrl = await iigClient.getMigratedFileUrl(answer.context_audio_file_id, token);
              if (contextAudioUrl) {
                const sttRes = await dynamicDifyClient.transcribeSpeech(contextAgent.api_endpoint, contextAgent.api_key, contextAudioUrl, 'audio_context', '');
                const sttOutputs = sttRes.data?.outputs || {};
                let contextTextVal = sttOutputs.transcribe || sttOutputs.text || '';
                if (sttOutputs.result) {
                  const jsonMatch = sttOutputs.result.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.transcribe) contextTextVal = parsed.transcribe;
                  }
                }
                if (contextTextVal) {
                  answer.context_text = contextTextVal;
                  await db.query(
                    'UPDATE submission_answers SET context_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [contextTextVal, answerId]
                  );
                  console.log(`[Grading] Auto-context-STT success. Text: "${contextTextVal}"`);
                }
              }
            } catch (err) {
              console.error(`[Grading] Auto-context-STT failed:`, err.message);
            }
          }
        }

        // 2. Auto-transcribe question audio if question_name is missing
        if (answer.question_audio_file_id && (!answer.question_name || !answer.question_name.trim())) {
          console.log(`[Grading] question_name missing for Answer ID: ${answerId}. Auto-triggering question STT...`);
          const questionSttRes = await db.query(
            "SELECT * FROM ai_agents WHERE api_type = 'STT' AND stt_target = 'question' AND target_questions ? $1 LIMIT 1",
            [qTypeKey]
          );
          if (questionSttRes.rows.length > 0) {
            const questionAgent = questionSttRes.rows[0];
            try {
              const token = await tokenManager.ensureFreshToken();
              const questionAudioUrl = await iigClient.getMigratedFileUrl(answer.question_audio_file_id, token);
              if (questionAudioUrl) {
                const sttRes = await dynamicDifyClient.transcribeSpeech(questionAgent.api_endpoint, questionAgent.api_key, questionAudioUrl, 'audio_question', '');
                const sttOutputs = sttRes.data?.outputs || {};
                let questionTextVal = sttOutputs.transcribe || sttOutputs.text || '';
                if (sttOutputs.result) {
                  const jsonMatch = sttOutputs.result.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.transcribe) questionTextVal = parsed.transcribe;
                  }
                }
                if (questionTextVal) {
                  answer.question_name = questionTextVal;
                  await db.query(
                    'UPDATE submission_answers SET question_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [questionTextVal, answerId]
                  );
                  console.log(`[Grading] Auto-question-STT success. Text: "${questionTextVal}"`);
                }
              }
            } catch (err) {
              console.error(`[Grading] Auto-question-STT failed:`, err.message);
            }
          }
        }

        // 3. Auto-transcribe student answer if missing
        if (!existingTranscribe.trim()) {
          console.log(`[Grading] Student answer transcribe not found for Answer ID: ${answerId}. Auto-triggering STT first...`);
          const agentsRes = await db.query(
            "SELECT * FROM ai_agents WHERE api_type = 'STT' AND stt_target = 'student_answer' AND target_questions ? $1 LIMIT 1",
            [qTypeKey]
          );

          if (agentsRes.rows.length > 0) {
            const sttAgent = agentsRes.rows[0];
            console.log(`[Grading] Found Student Answer STT Agent: ${sttAgent.name}. Fetching transcription...`);
            
            try {
              const sttRes = await dynamicDifyClient.evaluateSpeech(sttAgent.api_endpoint, sttAgent.api_key, audioUrl, answer.prompt_text || '');
              const sttOutputs = sttRes.data?.outputs || {};
              let sttText = sttOutputs.transcribe || sttOutputs.text || '';
              if (sttOutputs.result) {
                try {
                  const jsonMatch = sttOutputs.result.match(/\{[\s\S]*\}/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.transcribe) sttText = parsed.transcribe;
                  }
                } catch (e) {}
              }

              if (sttText) {
                existingTranscribe = sttText;
                console.log(`[Grading] Auto-STT success. Transcribed text: "${sttText}"`);
                
                // Save transcribed text to DB immediately
                await db.query(
                  `INSERT INTO ai_evaluation_results (answer_id, transcribe, updated_at)
                   VALUES ($1, $2, CURRENT_TIMESTAMP)
                   ON CONFLICT (answer_id)
                   DO UPDATE SET transcribe = EXCLUDED.transcribe, updated_at = CURRENT_TIMESTAMP`,
                  [answerId, sttText]
                );
              }
            } catch (sttErr) {
              console.error(`[Grading] Auto-STT call failed:`, sttErr.message);
            }
          } else {
            console.warn(`[Grading] No Student Answer STT Agent mapped to Q${qNo} for auto-transcription.`);
          }
        }

        // Call Dynamic Speech Evaluation passing existing transcription, image URL, context_text and question_name
        difyResult = await dynamicDifyClient.evaluateSpeech(
          agent.api_endpoint, 
          agent.api_key, 
          audioUrl, 
          answer.prompt_text, 
          existingTranscribe, 
          answer.image_url,
          answer.context_text,
          answer.question_name || answer.prompt_text || ''
        );
      } else {
        // Writing Section evaluation
        difyResult = await dynamicDifyClient.evaluateWriting(
          agent.api_endpoint, 
          agent.api_key, 
          answer.student_writing || '', 
          answer.prompt_text || '', 
          answer.question_name || '',
          answer.image_url || '',
          answer.keywords || answer.prompt_text || ''
        );
      }

      const responseReceivedAt = new Date();

      // Dify Workflow returns object in data.outputs
      const outputs = difyResult.data?.outputs || {};
      let transcribe = outputs.transcribe || outputs.text || null;
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

      const pronunciationScore = outputs.pronunciation_score || parsedEvaluation.pronunciation_score || null;
      const pronunciationRationale = outputs.pronunciation_rationale || parsedEvaluation.pronunciation_rationale || null;
      const intonationScore = outputs.intonation_score || parsedEvaluation.intonation_score || null;
      const intonationRationale = outputs.intonation_rationale || parsedEvaluation.intonation_rationale || null;

      const cohesionScore = outputs.cohesion_score || parsedEvaluation.cohesion_score || outputs.organization_score || parsedEvaluation.organization_score || null;
      const cohesionRationale = outputs.cohesion_rationale || parsedEvaluation.cohesion_rationale || outputs.organization_rationale || parsedEvaluation.organization_rationale || null;
      const grammarScore = outputs.grammar_score || parsedEvaluation.grammar_score || outputs.quality_variety_score || parsedEvaluation.quality_variety_score || null;
      const grammarRationale = outputs.grammar_rationale || parsedEvaluation.grammar_rationale || outputs.quality_variety_rationale || parsedEvaluation.quality_variety_rationale || null;
      const vocabularyScore = outputs.vocabulary_score || parsedEvaluation.vocabulary_score || outputs.keyword_score || parsedEvaluation.keyword_score || null;
      const vocabularyRationale = outputs.vocabulary_rationale || parsedEvaluation.vocabulary_rationale || outputs.keyword_rationale || parsedEvaluation.keyword_rationale || null;
      const completenessScore = outputs.completeness_score || parsedEvaluation.completeness_score || null;
      const completenessRationale = outputs.completeness_rationale || parsedEvaluation.completeness_rationale || null;
      const relevanceScore = outputs.relevance_score || parsedEvaluation.relevance_score || outputs.support_score || parsedEvaluation.support_score || null;
      const relevanceRationale = outputs.relevance_rationale || parsedEvaluation.relevance_rationale || outputs.support_rationale || parsedEvaluation.support_rationale || null;

      // Calculate average score for Speaking Q1-2 (2 criteria)
      const qNo = parseInt(answer.question_no, 10);
      const isSpeakingQ1Q2 = answer.section === 'Speaking' && (qNo === 1 || qNo === 2);
      if (isSpeakingQ1Q2) {
        const pVal = parseFloat(pronunciationScore || 0);
        const iVal = parseFloat(intonationScore || 0);
        finalScore = Math.round((pVal + iVal) / 2);
        console.log(`[Grading Q1-2] Answer ID: ${answerId}, Pronunciation: ${pVal}, Intonation: ${iVal} => Calculated finalScore: ${finalScore}`);
      }

      // Calculate average score for Speaking Q3-4 (5 criteria)
      const isSpeakingQ3Q4 = answer.section === 'Speaking' && (qNo === 3 || qNo === 4);
      if (isSpeakingQ3Q4) {
        const cVal = parseFloat(cohesionScore || 0);
        const gVal = parseFloat(grammarScore || 0);
        const iVal = parseFloat(intonationScore || 0);
        const pVal = parseFloat(pronunciationScore || 0);
        const vVal = parseFloat(vocabularyScore || 0);
        finalScore = Math.round((cVal + gVal + iVal + pVal + vVal) / 5);
        console.log(`[Grading Q3-4] Answer ID: ${answerId}, Cohesion: ${cVal}, Grammar: ${gVal}, Intonation: ${iVal}, Pronunciation: ${pVal}, Vocabulary: ${vVal} => Calculated finalScore: ${finalScore}`);
      }

      // Calculate average score for Speaking Q5-11 (7 criteria)
      const isSpeakingQ5Q11 = answer.section === 'Speaking' && (qNo >= 5 && qNo <= 11);
      if (isSpeakingQ5Q11) {
        const pVal = parseFloat(pronunciationScore || 0);
        const iVal = parseFloat(intonationScore || 0);
        const cVal = parseFloat(cohesionScore || 0);
        const gVal = parseFloat(grammarScore || 0);
        const vVal = parseFloat(vocabularyScore || 0);
        const compVal = parseFloat(completenessScore || 0);
        const rVal = parseFloat(relevanceScore || 0);
        finalScore = Math.round((pVal + iVal + cVal + gVal + vVal + compVal + rVal) / 7);
        console.log(`[Grading Q5-11] Answer ID: ${answerId}, Pronunciation: ${pVal}, Intonation: ${iVal}, Cohesion: ${cVal}, Grammar: ${gVal}, Vocabulary: ${vVal}, Completeness: ${compVal}, Relevance: ${rVal} => Calculated finalScore: ${finalScore}`);
      }

      // Calculate average score for Writing Q1-5 (3 criteria: Grammar, Relevance & Keyword, max 3)
      const isWritingQ1Q5 = answer.section === 'Writing' && (qNo >= 1 && qNo <= 5);
      if (isWritingQ1Q5 && finalScore === null) {
        const gVal = parseFloat(grammarScore || 0);
        const rVal = parseFloat(relevanceScore || 0);
        const kVal = parseFloat(vocabularyScore || 0); // keyword_score is mapped to vocabularyScore
        finalScore = Math.round((gVal + rVal + kVal) / 3);
        console.log(`[Grading W1-5] Answer ID: ${answerId}, Grammar: ${gVal}, Relevance: ${rVal}, Keyword: ${kVal} => Calculated finalScore: ${finalScore}`);
      }

      // Calculate average score for Writing Q6-7 (4 criteria: Grammar, Relevance, Cohesion, Vocabulary, max 8)
      const isWritingQ6Q7 = answer.section === 'Writing' && (qNo === 6 || qNo === 7);
      if (isWritingQ6Q7 && finalScore === null) {
        const gVal = parseFloat(grammarScore || 0);
        const rVal = parseFloat(relevanceScore || 0);
        const cVal = parseFloat(cohesionScore || 0);
        const vVal = parseFloat(vocabularyScore || 0);

        let criteriaCount = 0;
        let sum = 0;
        if (grammarScore !== null) { criteriaCount++; sum += gVal; }
        if (relevanceScore !== null) { criteriaCount++; sum += rVal; }
        if (cohesionScore !== null) { criteriaCount++; sum += cVal; }
        if (vocabularyScore !== null) { criteriaCount++; sum += vVal; }

        if (criteriaCount > 0) {
          // Simple average of present criteria groups, rounded
          finalScore = Math.round(sum / criteriaCount);
        } else {
          finalScore = 0;
        }
        console.log(`[Grading W6-7] Answer ID: ${answerId}, Sum: ${sum}, Count: ${criteriaCount} => Calculated finalScore: ${finalScore}`);
      }

      // Calculate average score for Writing Q8 (4 criteria: Grammar, Relevance, Cohesion, Vocabulary, max 5)
      const isWritingQ8 = answer.section === 'Writing' && qNo === 8;
      if (isWritingQ8 && finalScore === null) {
        const gVal = parseFloat(grammarScore || 0);
        const rVal = parseFloat(relevanceScore || 0);
        const cVal = parseFloat(cohesionScore || 0);
        const vVal = parseFloat(vocabularyScore || 0);

        let criteriaCount = 0;
        let sum = 0;
        if (grammarScore !== null) { criteriaCount++; sum += gVal; }
        if (relevanceScore !== null) { criteriaCount++; sum += rVal; }
        if (cohesionScore !== null) { criteriaCount++; sum += cVal; }
        if (vocabularyScore !== null) { criteriaCount++; sum += vVal; }

        if (criteriaCount > 0) {
          // Simple average of present criteria groups, rounded
          finalScore = Math.round(sum / criteriaCount);
        } else {
          finalScore = 0;
        }
        console.log(`[Grading W8] Answer ID: ${answerId}, Sum: ${sum}, Count: ${criteriaCount} => Calculated finalScore: ${finalScore}`);
      }

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
          cohesion_score, cohesion_rationale, grammar_score, grammar_rationale, vocabulary_score, vocabulary_rationale,
          completeness_score, completeness_rationale, relevance_score, relevance_rationale,
          errors, overall_1, overall_2, key_errors, strength, weakness, improvement, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, CURRENT_TIMESTAMP)
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
           cohesion_score = EXCLUDED.cohesion_score,
           cohesion_rationale = EXCLUDED.cohesion_rationale,
           grammar_score = EXCLUDED.grammar_score,
           grammar_rationale = EXCLUDED.grammar_rationale,
           vocabulary_score = EXCLUDED.vocabulary_score,
           vocabulary_rationale = EXCLUDED.vocabulary_rationale,
           completeness_score = EXCLUDED.completeness_score,
           completeness_rationale = EXCLUDED.completeness_rationale,
           relevance_score = EXCLUDED.relevance_score,
           relevance_rationale = EXCLUDED.relevance_rationale,
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
          cohesionScore, cohesionRationale, grammarScore, grammarRationale, vocabularyScore, vocabularyRationale,
          completenessScore, completenessRationale, relevanceScore, relevanceRationale,
          errorsList, overall1, overall2, keyErrors, strength, weakness, improvement
        ]
      );

      // 5. Update answer status in submission_answers to 'scored'
      await db.query(
        'UPDATE submission_answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['scored', answerId]
      );
      await refreshSubmissionStatus(answer.submission_id);

      return res.json({
        success: true,
        message: 'Chấm điểm AI hoàn tất thành công.',
        data: {
          answerId,
          transcribe,
          finalScore,
          scores: {
            pronunciation_score: pronunciationScore,
            intonation_score: intonationScore,
            cohesion_score: cohesionScore,
            grammar_score: grammarScore,
            vocabulary_score: vocabularyScore,
            completeness_score: completenessScore,
            relevance_score: relevanceScore
          }
        }
      });
    } catch (error) {
      console.error('gradeAnswerWithAI Error:', error);
      try {
        await db.query(
          'UPDATE submission_answers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          ['error', answerId]
        );
        // Fetch answer to get submission_id for status sync
        const ansSearch = await db.query('SELECT submission_id FROM submission_answers WHERE id = $1', [answerId]);
        if (ansSearch.rows.length > 0) {
          await refreshSubmissionStatus(ansSearch.rows[0].submission_id);
        }
      } catch (dbErr) {
        console.error('Failed to set error status in DB:', dbErr);
      }
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Dedicated STT Transcribe API through dynamic AI Agent.
   */
  async transcribeAnswerWithAI(req, res) {
    const { answerId, agentId, targetType } = req.body;
    const cleanTargetType = targetType || 'student_answer'; // student_answer, question, context
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

      // 2. Fetch the answer details
      const answerRes = await db.query(
        'SELECT * FROM submission_answers WHERE id = $1',
        [answerId]
      );
      if (answerRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy câu trả lời.' });
      }

      const answer = answerRes.rows[0];

      // Resolve matching Agent if agentId wasn't passed or wasn't found
      if (!agent) {
        const qNo = parseInt(answer.question_no, 10);
        let qTypeKey = '';
        if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
        else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
        else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
        else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
        else qTypeKey = 'sp_opinion';

        const agentRes = await db.query(
          "SELECT * FROM ai_agents WHERE api_type = 'STT' AND stt_target = $1 AND target_questions ? $2 LIMIT 1",
          [cleanTargetType, qTypeKey]
        );
        if (agentRes.rows.length > 0) {
          agent = agentRes.rows[0];
        }
      }

      if (!agent) {
        return res.status(404).json({ success: false, error: `Không tìm thấy Agent cấu hình Transcribe tương ứng cho ${cleanTargetType}.` });
      }

      // 3. Resolve audio URL based on cleanTargetType
      let audioUrl = null;
      if (cleanTargetType === 'student_answer') {
        const evalRes = await db.query(
          'SELECT cleaned_audio_url FROM ai_evaluation_results WHERE answer_id = $1',
          [answerId]
        );
        audioUrl = evalRes.rows[0]?.cleaned_audio_url;

        const storageService = require('../services/storageService');
        if (audioUrl && storageService.isR2Key(audioUrl)) {
          try {
            audioUrl = await storageService.getSignedAudioUrl(audioUrl);
            console.log(`[Transcribe] Resolved R2 pre-signed URL for STT.`);
          } catch (r2Err) {
            console.warn(`[Transcribe] R2 pre-signed URL failed: ${r2Err.message}`);
            audioUrl = null;
          }
        }

        const isLocalhost = audioUrl && (audioUrl.includes('localhost') || audioUrl.includes('127.0.0.1'));
        if (isLocalhost) {
          if (process.env.PUBLIC_URL) {
            audioUrl = audioUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1):\d+/, process.env.PUBLIC_URL);
          } else {
            audioUrl = null;
          }
        }

        if (!audioUrl) {
          if (!answer.student_audio_file_id) {
            return res.status(400).json({ success: false, error: 'Câu trả lời thiếu file ghi âm.' });
          }
          const token = await tokenManager.ensureFreshToken();
          audioUrl = await iigClient.getMigratedFileUrl(answer.student_audio_file_id, token);
        }
      } else if (cleanTargetType === 'question') {
        if (!answer.question_audio_file_id) {
          return res.status(400).json({ success: false, error: 'Câu hỏi thiếu file ghi âm.' });
        }
        const token = await tokenManager.ensureFreshToken();
        audioUrl = await iigClient.getMigratedFileUrl(answer.question_audio_file_id, token);
      } else if (cleanTargetType === 'context') {
        if (!answer.context_audio_file_id) {
          return res.status(400).json({ success: false, error: 'Bối cảnh thiếu file ghi âm.' });
        }
        const token = await tokenManager.ensureFreshToken();
        audioUrl = await iigClient.getMigratedFileUrl(answer.context_audio_file_id, token);
      }

      if (!audioUrl) {
        return res.status(404).json({ success: false, error: 'Không thể giải quyết URL tệp ghi âm.' });
      }

      // 4. Send speech-to-text request to dynamic Agent with correct parameter key
      const dynamicDifyClient = require('../clients/dynamicDifyClient');
      const fileKey = cleanTargetType === 'question' ? 'audio_question' : (cleanTargetType === 'context' ? 'audio_context' : 'student_audio');
      const difyResult = await dynamicDifyClient.transcribeSpeech(agent.api_endpoint, agent.api_key, audioUrl, fileKey, answer.prompt_text || '');

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
        } catch (e) {}
      }

      if (!transcribe) {
        transcribe = typeof outputs === 'object' ? JSON.stringify(outputs) : String(outputs);
      }

      // 5. Save transcription based on target type
      if (cleanTargetType === 'student_answer') {
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
      } else if (cleanTargetType === 'question') {
        await db.query(
          'UPDATE submission_answers SET question_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [transcribe, answerId]
        );
      } else if (cleanTargetType === 'context') {
        await db.query(
          'UPDATE submission_answers SET context_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [transcribe, answerId]
        );
      }

      return res.json({
        success: true,
        message: 'Dịch giọng nói (STT) hoàn tất.',
        data: {
          answerId,
          targetType: cleanTargetType,
          transcribe
        }
      });
    } catch (error) {
      console.error('transcribeAnswerWithAI Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * API to clean / reduce noise from student answer recording
   */
  async cleanAnswerAudio(req, res) {
    const { answerId, method } = req.body;
    if (!answerId) {
      return res.status(400).json({ success: false, error: 'answerId is required.' });
    }

    try {
      // 1. Fetch the answer details
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

      // 2. Resolve temporary URL via IIG client
      const token = await tokenManager.ensureFreshToken();
      const audioUrl = await iigClient.getMigratedFileUrl(answer.student_audio_file_id, token);
      if (!audioUrl) {
        return res.status(404).json({ success: false, error: 'Không thể giải quyết URL tệp ghi âm từ IIG.' });
      }

      // 3. Process cleaning
      const audioCleanerService = require('../services/audioCleanerService');
      const cleanResult = await audioCleanerService.cleanAudio(
        audioUrl,
        answer.student_audio_file_id,
        method || 'ai'
      );

      // Determine what URL to store in DB and return to frontend
      const storageService = require('../services/storageService');
      let storedUrl;
      let responseUrl;

      if (storageService.isR2Key(cleanResult.urlPath)) {
        // R2 path: store the r2: key, generate pre-signed URL for frontend playback
        storedUrl = cleanResult.urlPath; // e.g. "r2:cleaned-audio/xxx.wav"
        try {
          responseUrl = await storageService.getSignedAudioUrl(cleanResult.urlPath);
        } catch (e) {
          responseUrl = null;
        }
      } else {
        // Local path: build full URL as before
        const host = req.get('host');
        const protocol = req.protocol;
        storedUrl = `${protocol}://${host}${cleanResult.urlPath}`;
        responseUrl = storedUrl;
      }

      // 4. Save cleaned audio URL to DB
      await db.query(
        `INSERT INTO ai_evaluation_results (
          answer_id, cleaned_audio_url, updated_at
         ) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (answer_id)
         DO UPDATE SET
           cleaned_audio_url = EXCLUDED.cleaned_audio_url,
           updated_at = CURRENT_TIMESTAMP`,
        [answerId, storedUrl]
      );

      return res.json({
        success: true,
        message: 'Làm sạch âm thanh thành công.',
        data: {
          answerId,
          originalFileId: answer.student_audio_file_id,
          cleanedAudioUrl: responseUrl,
          methodUsed: cleanResult.methodUsed
        }
      });

    } catch (error) {
      console.error('cleanAnswerAudio Error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Exports checked submissions as an Excel-compatible CSV file
   */
  async exportSubmissionsExcel(req, res) {
    const { submissionIds } = req.body;
    if (!submissionIds || !Array.isArray(submissionIds) || submissionIds.length === 0) {
      return res.status(400).json({ success: false, error: 'submissionIds is required and must be a non-empty array.' });
    }

    try {
      // 1. Fetch submission details along with answers and their evaluations
      const query = `
        SELECT s.id AS sub_id, s.keycode, s.test_name, s.submitted_date, s.synced_at, s.status,
               sa.section, sa.question_no,
               er.final_score
        FROM mocktest_submissions s
        LEFT JOIN submission_answers sa ON sa.submission_id = s.id
        LEFT JOIN ai_evaluation_results er ON er.answer_id = sa.id
        WHERE s.id = ANY($1)
        ORDER BY s.submitted_date DESC, sa.section DESC, sa.question_no ASC
      `;
      const result = await db.query(query, [submissionIds]);

      // 2. Group answers by submission ID to build a single row per candidate
      const submissionMap = {};
      result.rows.forEach(row => {
        const sid = row.sub_id;
        if (!submissionMap[sid]) {
          submissionMap[sid] = {
            keycode: row.keycode,
            test_name: row.test_name,
            submitted_date: row.submitted_date,
            synced_at: row.synced_at,
            status: row.status,
            scores: {}
          };
        }

        if (row.section && row.question_no) {
          const qNo = parseInt(row.question_no, 10);
          // Q1-11 Speaking, Q12-19 Writing 1-8
          const key = row.section === 'Speaking' ? `Q${qNo}` : `Q${qNo + 11}`;
          if (row.final_score !== null) {
            submissionMap[sid].scores[key] = Math.round(parseFloat(row.final_score));
          }
        }
      });

      // 3. Define headers
      const headers = [
        'Keycode',
        'Tên đề',
        'ngày nộp',
        'đồng bộ',
        'trạng thái',
        ...Array.from({ length: 19 }, (_, i) => `Q${i + 1}`)
      ];

      // Helper function to map status code to label
      const getStatusLabel = (status) => {
        switch (status) {
          case 1: return 'Chưa chấm';
          case 2: return 'Đang chấm';
          case 3: return 'Đã chấm';
          case 4: return 'Lỗi';
          default: return 'Không xác định';
        }
      };

      // 4. Build sheet rows using array of arrays format
      const dataRows = [headers];

      Object.values(submissionMap).forEach(sub => {
        const submittedDateStr = sub.submitted_date ? new Date(sub.submitted_date).toLocaleString('vi-VN') : '';
        const syncedDateStr = sub.synced_at ? new Date(sub.synced_at).toLocaleString('vi-VN') : '';
        const statusLabel = getStatusLabel(sub.status);

        // Q1-19 scores list
        const qScores = Array.from({ length: 19 }, (_, i) => {
          const score = sub.scores[`Q${i + 1}`];
          return score !== undefined ? score : '';
        });

        const rowData = [
          sub.keycode || '',
          sub.test_name || '',
          submittedDateStr,
          syncedDateStr,
          statusLabel,
          ...qScores
        ];

        dataRows.push(rowData);
      });

      // 5. Generate Workbook and Worksheet using sheetjs (xlsx)
      const XLSX = require('xlsx');
      const worksheet = XLSX.utils.aoa_to_sheet(dataRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Submissions');

      // Write to binary buffer
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

      // 6. Send .xlsx file attachment response
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="export_data_submissions.xlsx"');
      return res.status(200).send(excelBuffer);

    } catch (error) {
      console.error('exportSubmissionsExcel error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  /**
   * Save or update teacher note for a specific AI evaluation result (by answer_id)
   */
  async saveTeacherNote(req, res) {
    const { answer_id, teacher_note } = req.body;
    if (!answer_id) {
      return res.status(400).json({ success: false, error: 'answer_id is required.' });
    }
    try {
      // Upsert: if evaluation row exists update it, otherwise create a minimal row
      const existing = await db.query(
        'SELECT id FROM ai_evaluation_results WHERE answer_id = $1',
        [answer_id]
      );
      if (existing.rows.length === 0) {
        // Create a placeholder row so we can store the note
        await db.query(
          'INSERT INTO ai_evaluation_results (answer_id, teacher_note, created_at, updated_at) VALUES ($1, $2, NOW(), NOW())',
          [answer_id, teacher_note || null]
        );
      } else {
        await db.query(
          'UPDATE ai_evaluation_results SET teacher_note = $1, updated_at = NOW() WHERE answer_id = $2',
          [teacher_note || null, answer_id]
        );
      }
      return res.json({ success: true, message: 'Nhận xét giáo viên đã được lưu.' });
    } catch (error) {
      console.error('saveTeacherNote error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = submissionController;
