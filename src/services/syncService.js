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

function normalizeMappingItem(item) {
  const keycode = String(item?.keyCode || '').trim().toUpperCase();
  const courseScoringId = String(item?.id || '').trim();
  if (!keycode || !courseScoringId) return null;
  return {
    keycode,
    courseScoringId,
    studentName: item.webUserName || null,
    testName: item.mockTestName || item.name || null,
  };
}

function mappingListPayload({ page, pageSize, keyword, fromSubmittedDate, toSubmittedDate }) {
  return {
    PageNumber: page,
    PageSize: pageSize,
    Keyword: keyword || undefined,
    Statuses: [],
    SubmittedDateFrom: fromSubmittedDate || undefined,
    SubmittedDateTo: toSubmittedDate || undefined,
    ScoringDeadlineFrom: undefined,
    ScoringDeadlineTo: undefined,
    MockTestIds: [],
    CourseIds: [],
    AssigneeUserIds: [],
    KeyCodeTypes: [],
  };
}

async function persistMappings(database, mappings) {
  const work = async executor => {
    for (const mapping of mappings) {
      await executor.query(
        `INSERT INTO keycode_mappings (keycode, course_scoring_id, student_name, test_name, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (keycode) DO UPDATE SET
           course_scoring_id = EXCLUDED.course_scoring_id,
           student_name = COALESCE(EXCLUDED.student_name, keycode_mappings.student_name),
           test_name = COALESCE(EXCLUDED.test_name, keycode_mappings.test_name),
           updated_at = CURRENT_TIMESTAMP`,
        [mapping.keycode, mapping.courseScoringId, mapping.studentName, mapping.testName]
      );
    }
  };
  if (typeof database.transaction === 'function') return database.transaction(work);
  return work(database);
}

const syncService = {
  /**
   * Synchronizes every matching page from the current Elearning Admin API.
   * Uses the explicit keyCode and scoring id returned by the upstream service.
   */
  async syncMappings(
    { pageSize = 1000, keyword = null, fromSubmittedDate = null, toSubmittedDate = null } = {},
    dependencies = {}
  ) {
    const client = dependencies.iigClient || iigClient;
    const database = dependencies.database || db;
    const safePageSize = Math.min(5000, Math.max(1, Number.parseInt(pageSize, 10) || 100));
    console.log(`📥 Fetching IIG mappings with pageSize=${safePageSize}, keyword=${keyword}, dates=${fromSubmittedDate} to ${toSubmittedDate}...`);

    const mappingsByKeycode = new Map();
    let page = 1;
    let totalPages = 1;
    do {
      const response = await client.listMocktestScorings(mappingListPayload({
        page,
        pageSize: safePageSize,
        keyword,
        fromSubmittedDate,
        toSubmittedDate,
      }));
      const pagedData = response?.pagedData;
      if (!pagedData || !Array.isArray(pagedData.items)) {
        throw new Error('IIG admin scoring list returned an invalid pagedData response.');
      }

      for (const item of pagedData.items) {
        const mapping = normalizeMappingItem(item);
        if (mapping && !mappingsByKeycode.has(mapping.keycode)) {
          mappingsByKeycode.set(mapping.keycode, mapping);
        }
      }

      totalPages = Math.max(1, Number(pagedData.totalPages) || 1);
      if (!pagedData.hasNextPage) break;
      page += 1;
    } while (page <= totalPages);

    const mappings = [...mappingsByKeycode.values()];
    await persistMappings(database, mappings);
    console.log(`✅ Upserted ${mappings.length} keycode mapping entries from ${page} IIG page(s).`);
    return mappings.length;
  },

  /**
   * Resolves a keycode's courseScoringId by checking the local cache table
   * or searching online using the Elearning API if not found.
   */
  async resolveCourseScoringId(keycode, dependencies = {}) {
    const client = dependencies.iigClient || iigClient;
    const database = dependencies.database || db;
    const cleanKeycode = keycode.trim().toUpperCase();
    
    // 1. Check local keycode_mappings
    const cached = await database.query(
      'SELECT course_scoring_id, student_name, test_name FROM keycode_mappings WHERE keycode = $1',
      [cleanKeycode]
    );

    if (cached.rows.length > 0) {
      console.log(`📦 Found ID for keycode ${cleanKeycode} locally in DB:`, cached.rows[0].course_scoring_id);
      return cached.rows[0];
    }

    // 2. Fetch from the current Elearning Admin proxy
    console.log(`🔍 Keycode ${cleanKeycode} not found in DB. Performing online lookup...`);
    const searchRes = await client.listMocktestScorings(mappingListPayload({
      page: 1,
      pageSize: 50,
      keyword: cleanKeycode,
    }));
    const items = searchRes?.pagedData?.items || [];
    const matchedItem = items.find(item => String(item.keyCode || '').trim().toUpperCase() === cleanKeycode);
    if (!matchedItem) throw new Error(`KeyCode '${cleanKeycode}' was not found in IIG Elearning.`);

    const resolved = {
      course_scoring_id: matchedItem.id,
      student_name: matchedItem.webUserName || null,
      test_name: matchedItem.mockTestName || matchedItem.name || null
    };

    // Store resolved mapping in DB (including online resolved test name)
    await database.query(
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
module.exports.mappingListPayload = mappingListPayload;
module.exports.normalizeMappingItem = normalizeMappingItem;
