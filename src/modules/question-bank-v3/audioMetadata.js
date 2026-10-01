const { execFile } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

async function durationSeconds(buffer, originalName = 'audio.mp3') {
  const extension = path.extname(String(originalName || '')) || '.audio';
  const target = path.join(os.tmpdir(), `question-media-${crypto.randomUUID()}${extension}`);
  await fs.writeFile(target, buffer);
  try {
    const value = await new Promise((resolve, reject) => {
      execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', target], (error, stdout) => {
        if (error) return reject(error);
        resolve(Number.parseFloat(stdout));
      });
    });
    if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid audio duration');
    return Math.round(value * 1000) / 1000;
  } finally {
    await fs.unlink(target).catch(() => {});
  }
}

module.exports = { durationSeconds };
