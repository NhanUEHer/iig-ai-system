const { EMPTY_USAGE } = require('./normalize');

const name = 'fake';
const queue = [];

function enqueue(response) {
  queue.push(response);
}

function clear() {
  queue.length = 0;
}

async function generate(options = {}) {
  if (queue.length === 0 && options.model === 'fake-demo') {
    const match = String(options.user || '').match(/^Echo this text:\s*([\s\S]*?)\.?$/i);
    const text = match?.[1] || '';
    return {
      text: JSON.stringify({ text }),
      usage: { ...EMPTY_USAGE, input: await countTokens(options), output: 4 },
      finishReason: 'stop',
      raw: null,
    };
  }
  if (queue.length === 0) throw new Error('Fake provider response queue is empty.');
  const next = queue.shift();
  if (next?.error) throw next.error instanceof Error ? next.error : Object.assign(new Error('Fake provider error.'), next.error);
  return {
    text: String(next?.text || ''),
    usage: { ...EMPTY_USAGE, ...(next?.usage || {}) },
    finishReason: next?.finishReason || 'stop',
    raw: next?.raw || null,
  };
}

async function countTokens({ system, user }) {
  return Math.ceil((String(system || '').length + String(user || '').length) / 4);
}

async function check() {
  return { ok: true, ms: 0, models: ['fake'] };
}

module.exports = { name, enqueue, clear, reset: clear, generate, countTokens, check };
