const db = require('../../config/db');
const { resolveAnswerQuestionType } = require('./questionType');

const VALID_API_TYPES = new Set(['Grading', 'STT']);
const VALID_STT_TARGETS = new Set(['student_answer', 'question', 'context']);

async function findAgentById(agentId, database = db) {
  if (!agentId) return null;
  const result = await database.query('SELECT * FROM ai_agents WHERE id = $1', [agentId]);
  return result.rows[0] || null;
}

async function findMatchingAgent({ apiType, sttTarget, questionType }, database = db) {
  if (!VALID_API_TYPES.has(apiType) || !questionType) return null;
  if (apiType === 'STT') {
    if (!VALID_STT_TARGETS.has(sttTarget)) return null;
    const result = await database.query(
      `SELECT * FROM ai_agents
       WHERE api_type = 'STT' AND stt_target = $1 AND target_questions ? $2
       ORDER BY id ASC LIMIT 1`,
      [sttTarget, questionType]
    );
    return result.rows[0] || null;
  }

  const result = await database.query(
    `SELECT * FROM ai_agents
     WHERE api_type = 'Grading' AND target_questions ? $1
     ORDER BY id ASC LIMIT 1`,
    [questionType]
  );
  return result.rows[0] || null;
}

async function selectAgent({ agentId, apiType, sttTarget, answer }, database = db) {
  const requestedAgent = await findAgentById(agentId, database);
  const questionType = resolveAnswerQuestionType(answer);
  if (requestedAgent) {
    const targets = Array.isArray(requestedAgent.target_questions) ? requestedAgent.target_questions : [];
    const matches = requestedAgent.api_type === apiType && targets.includes(questionType) &&
      (apiType !== 'STT' || requestedAgent.stt_target === sttTarget);
    return matches ? requestedAgent : null;
  }
  return findMatchingAgent({ apiType, sttTarget, questionType }, database);
}

module.exports = { findAgentById, findMatchingAgent, selectAgent };
