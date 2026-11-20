'use strict';

// Fingerprints of the source text each generated part depends on.
// Generated content stores the fingerprint it was built from; a mismatch means "stale".
const crypto = require('crypto');

const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const sha = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);

const passageHash = passage => sha(`p:${norm(passage)}`);

// A question pack depends on the passage (quotes) and on the question, its options and answer key.
function questionHash(passage, question = {}) {
  const options = Object.entries(question.options || {}).sort(([a], [b]) => a.localeCompare(b))
    .map(([letter, text]) => `${letter}:${norm(text)}`).join('|');
  return sha(`q:${norm(passage)}#${norm(question.stem)}#${options}#${question.answerKey || ''}`);
}

// An image description depends on the image bytes and the question text sent as context.
// The same fingerprint is the reuse key: identical image + context never pays for a second AI call.
const imageHash = (sha256, contextText) => sha(`i:${sha256}#${norm(contextText)}`);

function artifactHash(type, context) {
  if (type === 'image_description') return imageHash(context.image?.sha256, context.contextText);
  return type === 'question_pack' ? questionHash(context.passage, context.question) : passageHash(context.passage);
}

module.exports = { passageHash, questionHash, imageHash, artifactHash, norm };
