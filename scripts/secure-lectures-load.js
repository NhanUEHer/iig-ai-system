#!/usr/bin/env node
const { randomUUID } = require('node:crypto');

const baseUrl = String(process.argv[2] || process.env.SECURE_LECTURES_LOAD_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const total = 200;

async function heartbeat(sessionId) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/public/lectures/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  await response.arrayBuffer();
  return performance.now() - started;
}

async function main() {
  const durations = await Promise.all(Array.from({ length: total }, () => heartbeat(randomUUID())));
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
  const summary = { devices: total, p95Ms: Number(p95.toFixed(2)), maxMs: Number(durations.at(-1).toFixed(2)), targetMs: 100 };
  console.log(JSON.stringify(summary));
  if (p95 >= 100) process.exitCode = 1;
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
