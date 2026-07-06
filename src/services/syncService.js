const db = require('../config/db');
const iigClient = require('../clients/iigClient');
const tokenManager = require('./tokenManager');

/**
 * Utility function to strip HTML tags and decode basic HTML entities
 */
function cleanHtml(rawHtml) {
  if (!rawHtml) return '';
  // Use greedy match inside quotes to handle <img src="url with >" alt="...">
  let text = rawHtml
    .replace(/<[^>]*>/g, ' ')   // strip all tags (greedy inside quotes too)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts image source URL from HTML content
 */
function extractImageUrl(htmlContent) {
  if (!htmlContent) return null;
  const match = htmlContent.match(/<img[^>]+src="([^">]+)"/i);
  return match ? match[1] : null;
}

/**
 * Extracts keywords inside <h4> tags for Writing Q1-Q5
 */
function extractKeywords(htmlContent) {
  if (!htmlContent) return null;
  const match = htmlContent.match(/<h4[^>]*>(.*?)<\/h4>/i);
  return match ? cleanHtml(match[1]) : null;
}

const syncService = {
  /**
   * Syncs keycode mappings from Elearning API using PageSize: 1000.
   * Extracts keycode and mapping information, saving/updating in local database.
   */
  async syncMappings({ pageSize = 1000, keyword = null, fromSubmittedDate = null, toSubmittedDate = null } = {}) {
    const token = await tokenManager.ensureFreshToken();
    console.log(`📥 Fetching ${pageSize} items from IIG API with filters keyword=${keyword}, dates=${fromSubmittedDate} to ${toSubmittedDate}...`);
    
    const payload = {
      Keyword: keyword || null,
      PageNum: 1,
      PageSize: pageSize,
      FromSubmittedDate: fromSubmittedDate || null,
      ToSubmittedDate: toSubmittedDate || null,
      FromDeadlineDate: null,
      ToDeadlineDate: null,
      StatusesFilter: [], // Pull all statuses so we don't miss mapped keycodes
      NameFilter: [],
      UnitOrCourseTestFilter: [],
      LessonFilter: [],
      StepFilter: [],
      ActiveScoringFilter: []
    };

    const resData = await iigClient.searchScoringList(payload, token);
    const items = resData.items || [];
    console.log(`Fetched ${items.length} pending items from IIG.`);

    let count = 0;
    for (const item of items) {
      const name = item.name || '';
      // Extract 6-character uppercase keycode e.g. [A-Z0-9]{6}-...
      const match = name.match(/^([A-Z0-9]{6})-(.*)$/);
      if (match) {
        const keycode = match[1];
        const testName = name;
        const studentName = item.webUserName || 'Unknown';
        const courseScoringId = item.id;
        const submittedDate = item.submittedDate || new Date();

        // Upsert into keycode_mappings (including student_name, test_name)
        await db.query(
          `INSERT INTO keycode_mappings (keycode, course_scoring_id, student_name, test_name, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (keycode) 
           DO UPDATE SET course_scoring_id = EXCLUDED.course_scoring_id,
                         student_name      = EXCLUDED.student_name,
                         test_name         = EXCLUDED.test_name,
                         updated_at        = CURRENT_TIMESTAMP`,
          [keycode, courseScoringId, studentName, testName]
        );
        count++;
      }
    }
    console.log(`✅ Upserted ${count} keycode mapping entries in DB.`);
    return count;
  },

  /**
   * Resolves a keycode's courseScoringId by checking the local cache table
   * or searching online using the Elearning API if not found.
   */
  async resolveCourseScoringId(keycode) {
    const cleanKeycode = keycode.trim().toUpperCase();
    
    // 1. Check local keycode_mappings
    // 1. Check local keycode_mappings
    const cached = await db.query(
      'SELECT course_scoring_id, student_name, test_name FROM keycode_mappings WHERE keycode = $1',
      [cleanKeycode]
    );

    if (cached.rows.length > 0) {
      console.log(`📦 Found ID for keycode ${cleanKeycode} locally in DB:`, cached.rows[0].course_scoring_id);
      return cached.rows[0];
    }

    // 2. Fetch from Elearning API
    console.log(`🔍 Keycode ${cleanKeycode} not found in DB. Performing online lookup...`);
    const token = await tokenManager.ensureFreshToken();
    
    // First retrieve filters to find the full test name containing keycode
    const payloadFilters = {
      Keyword: null, PageNum: 1, PageSize: 10,
      StatusesFilter: [], NameFilter: [], UnitOrCourseTestFilter: [], LessonFilter: [], StepFilter: [], ActiveScoringFilter: []
    };
    const filterRes = await iigClient.searchScoringList(payloadFilters, token);
    const dropDownFilters = filterRes.dropDownFilters || [];
    let nameFilterValues = [];
    for (const f of dropDownFilters) {
      if (f.key === 'NameFilter') {
        nameFilterValues = f.values || [];
        break;
      }
    }

    // Match matched full name
    const matchedFullName = nameFilterValues.find(val => val.startsWith(cleanKeycode) || val.includes(cleanKeycode));
    if (!matchedFullName) {
      throw new Error(`KeyCode '${cleanKeycode}' could not be resolved from IIG dropdown names.`);
    }
    console.log(`Match online: '${cleanKeycode}' -> '${matchedFullName}'`);

    // Search ID by matched full name
    const payloadSearch = {
      Keyword: null, PageNum: 1, PageSize: 50,
      StatusesFilter: [],
      NameFilter: [matchedFullName],
      UnitOrCourseTestFilter: [], LessonFilter: [], StepFilter: [], ActiveScoringFilter: []
    };
    
    const searchRes = await iigClient.searchScoringList(payloadSearch, token);
    const items = searchRes.items || [];
    if (items.length === 0) {
      throw new Error(`Online lookup failed for full name: '${matchedFullName}'`);
    }

    const matchedItem = items[0];
    const resolved = {
      course_scoring_id: matchedItem.id,
      student_name: matchedItem.courseScoringInfo?.webUserName || matchedItem.mocktestKeyCodeFullName || null,
      test_name: matchedFullName
    };

    // Store resolved mapping in DB (including online resolved test name)
    await db.query(
      `INSERT INTO keycode_mappings (keycode, course_scoring_id, student_name, test_name, updated_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (keycode) DO UPDATE SET 
         course_scoring_id = EXCLUDED.course_scoring_id,
         student_name      = COALESCE(EXCLUDED.student_name, keycode_mappings.student_name),
         test_name         = COALESCE(EXCLUDED.test_name, keycode_mappings.test_name),
         updated_at        = CURRENT_TIMESTAMP`,
      [cleanKeycode, resolved.course_scoring_id, resolved.student_name, resolved.test_name]
    );
    console.log(`✅ Cached resolved keycode mapping for ${cleanKeycode} in DB.`);

    return resolved;
  },

  /**
   * Synchronizes full test structure and detailed candidate answers
   * for a given keycode and stores them locally.
   */
  async syncSubmission(keycode) {
    // 1. Resolve keycode mapping
    const mapping = await this.resolveCourseScoringId(keycode);
    const cleanKeycode = keycode.trim().toUpperCase();
    const courseScoringId = mapping.course_scoring_id;
    const token = await tokenManager.ensureFreshToken();

    console.log(`🔄 Syncing mocktest submission: ${cleanKeycode} (ID: ${courseScoringId})...`);

    // 2. Fetch test structure details (Sections, Questionnaire list)
    const detailDataList = await iigClient.fetchCourseScoringDetail(courseScoringId, token);
    if (!detailDataList || detailDataList.length === 0) {
      throw new Error(`Failed to retrieve structure details for course scoring ID: ${courseScoringId}`);
    }

    const detailData = detailDataList[0] || {};
    const info = detailData.courseScoringInfo || {};
    let testName = info.name || mapping.test_name || 'Unknown Test';
    // Fix IIG API bug where the prefix keycode mismatches the actual keycode
    const mismatchMatch = testName.match(/^([A-Z0-9]{6})-(.*)$/);
    if (mismatchMatch && mismatchMatch[1] !== cleanKeycode) {
      testName = `${cleanKeycode}-${mismatchMatch[2]}`;
    }
    let studentName = info.webUserName || detailData.mocktestKeyCodeFullName || mapping.student_name || 'Unknown Student';
    let studentEmail = info.webUserEmail || null;
    let studentPhone = info.webUserMobileNumber || null;

    if (studentName === 'Unknown Student' || !studentName) {
      try {
        console.log(`🔍 Student name is Unknown in detail. Performing backup online lookup via searchScoringList for keycode ${cleanKeycode}...`);
        const searchPayload = {
          Keyword: cleanKeycode,
          PageNum: 1, PageSize: 5, StatusesFilter: [],
          NameFilter: [], UnitOrCourseTestFilter: [], LessonFilter: [], StepFilter: [], ActiveScoringFilter: []
        };
        const searchRes = await iigClient.searchScoringList(searchPayload, token);
        const searchItems = searchRes.items || [];
        if (searchItems.length > 0 && searchItems[0].courseScoringInfo) {
          const scInfo = searchItems[0].courseScoringInfo;
          if (scInfo.webUserName && scInfo.webUserName !== 'Unknown Student') {
            studentName = scInfo.webUserName;
            console.log(`🎯 Successfully recovered true student name: '${studentName}'`);
          }
          if (scInfo.webUserEmail && scInfo.webUserEmail !== 'Unknown Student') {
            studentEmail = scInfo.webUserEmail;
          }
          if (scInfo.webUserMobileNumber && scInfo.webUserMobileNumber !== 'Unknown Student') {
            studentPhone = scInfo.webUserMobileNumber;
          }
        }
      } catch (err) {
        console.error('Failed to run backup online lookup for student name:', err.message);
      }
    }

    const submittedDate = info.submittedDate || new Date();
    const apiStatus     = info.status || 1;
    const overallScore  = info.score  || null;
    const scoredDate    = info.scoredDate || null;

    // 3. Upsert mocktest_submissions main record
    await db.query(
      `INSERT INTO mocktest_submissions 
         (id, keycode, test_name, student_name, student_email, student_phone, status, overall_score, scored_date, submitted_date, updated_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         keycode        = EXCLUDED.keycode,
         test_name      = EXCLUDED.test_name,
         student_name   = COALESCE(NULLIF(EXCLUDED.student_name, 'Unknown Student'), mocktest_submissions.student_name, EXCLUDED.student_name),
         student_email  = EXCLUDED.student_email,
         student_phone  = EXCLUDED.student_phone,
         status         = EXCLUDED.status,
         overall_score  = EXCLUDED.overall_score,
         scored_date    = EXCLUDED.scored_date,
         submitted_date = EXCLUDED.submitted_date,
         updated_at     = CURRENT_TIMESTAMP,
         synced_at      = CURRENT_TIMESTAMP`,
      [courseScoringId, cleanKeycode, testName, studentName, studentEmail, studentPhone,
       apiStatus, overallScore, scoredDate, submittedDate]
    );
    
    // Update keycode_mappings with correct student_name and test_name (avoid overwriting valid names with 'Unknown Student')
    await db.query(
      `UPDATE keycode_mappings 
       SET student_name = COALESCE(NULLIF($1, 'Unknown Student'), student_name, $1), 
           test_name = $2, 
           updated_at = CURRENT_TIMESTAMP
       WHERE keycode = $3`,
      [studentName, testName, cleanKeycode]
    );
    console.log(`📝 Updated keycode_mappings for ${cleanKeycode} with student: ${studentName}`);

    // 4. Iterate and fetch each detailed question response
    const mckTestResponse = detailData.mckTestResponse || [];
    let questionCount = 0;

    for (const sectionObj of mckTestResponse) {
      const section = sectionObj.name; // "Speaking" or "Writing"
      const questionnaires = sectionObj.questionnaires || [];

      for (const qnaire of questionnaires) {
        const questions = qnaire.get_info_migrate_file || qnaire.questions || [];
        
        // Grab leftSection details (contains prompts, media)
        const leftSections = qnaire.leftSections || [{}];
        const leftSec = leftSections[0] || {};
        const textContent = leftSec.textContent || '';

        for (const q of questions) {
          const questionNo = q.no;
          const chooseId = q.chooseId;

          if (!chooseId) continue;

          console.log(`  Fetching details for ${section} Q${questionNo} (chooseId: ${chooseId})...`);
          
          // Fetch question detail response
          const qDetail = await iigClient.fetchQuestionDetails(chooseId, token);
          const qInfo = qDetail.questionInfo || {};
          const qLeftSecs = qDetail.leftSections || [{}];
          const qLeftSec = qLeftSecs[0] || {};

          // ── Extract all fields ──────────────────────────────────────────────
          const questionnaireType    = qInfo.questionnaireType || null;      // 13=Speaking, 14=ReadAloud, 15=Writing
          const questionTitle        = qLeftSec.title || null;               // e.g. "Question 3: Describe a Picture"
          const questionName         = qInfo.questionName   || null;         // specific question text / Directions
          const contextAudioFileId   = qLeftSec.audioFileId || null;         // context audio (Q5-7, Q8-10, Q11)
          const contextText          = qLeftSec.textScript  || null;         // caller transcript (Q8-10)
          const questionAudioFileId  = qInfo.audioFileId    || null;         // question audio (Q5-7, Q8-10)
          const prepTime             = qInfo.spaceTime      || null;         // e.g. "00:00:45"
          const recordingTime        = qInfo.recordingTime  || null;         // e.g. "00:00:30"
          const maxWritingLength     = qInfo.maxWritingLength || null;       // 50/500/1000

          const qTextContent = qLeftSec.textContent || textContent;
          let   promptText   = cleanHtml(qTextContent);
          let   imageUrl     = extractImageUrl(qTextContent);
          let   keywords     = null;
          let   studentWriting       = null;
          let   studentAudioFileId   = null;
          let   studentAudioUrl      = null;

          if (section === 'Speaking') {
            studentAudioFileId = qInfo.recordingFileId || null;
          } else if (section === 'Writing') {
            studentWriting = qInfo.writingAnswer || null;
            if (questionNo >= 1 && questionNo <= 5) {
              keywords = extractKeywords(qTextContent) || promptText;
            }          }

          // Generate answer ID
          const answerId = `${courseScoringId}_${section}_${questionNo}`;

          // Upsert question answer with all new columns
          await db.query(
            `INSERT INTO submission_answers 
               (id, submission_id, section, question_no, choose_id,
                questionnaire_type, question_title, question_name,
                prompt_text, image_url, keywords,
                context_audio_file_id, context_text, question_audio_file_id,
                prep_time, recording_time, max_writing_length,
                student_writing, student_audio_file_id, student_audio_url,
                status, updated_at)
             VALUES
               ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'pending',CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO UPDATE SET
               questionnaire_type     = EXCLUDED.questionnaire_type,
               question_title         = EXCLUDED.question_title,
               question_name          = EXCLUDED.question_name,
               prompt_text            = EXCLUDED.prompt_text,
               image_url              = EXCLUDED.image_url,
               keywords               = EXCLUDED.keywords,
               context_audio_file_id  = EXCLUDED.context_audio_file_id,
               context_text           = EXCLUDED.context_text,
               question_audio_file_id = EXCLUDED.question_audio_file_id,
               prep_time              = EXCLUDED.prep_time,
               recording_time         = EXCLUDED.recording_time,
               max_writing_length     = EXCLUDED.max_writing_length,
               student_writing        = EXCLUDED.student_writing,
               student_audio_file_id  = EXCLUDED.student_audio_file_id,
               student_audio_url      = EXCLUDED.student_audio_url,
               status                 = 'pending',
               updated_at             = CURRENT_TIMESTAMP`,
            [
              answerId, courseScoringId, section, questionNo, chooseId,
              questionnaireType, questionTitle, questionName,
              promptText, imageUrl, keywords,
              contextAudioFileId, contextText, questionAudioFileId,
              prepTime, recordingTime, maxWritingLength,
              studentWriting, studentAudioFileId, studentAudioUrl
            ]
          );
          questionCount++;
        }
      }
    }

    console.log(`✅ Synced mocktest submission ${cleanKeycode} successfully with ${questionCount} answers.`);
    return {
      courseScoringId,
      keycode: cleanKeycode,
      studentName: mapping.student_name,
      questionCount
    };
  }
};

module.exports = syncService;
