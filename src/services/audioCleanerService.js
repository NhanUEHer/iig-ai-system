const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const storageService = require('./storageService');

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const PROCESS_TIMEOUT_MS = 5 * 60 * 1000;

function execute(file, args, options = {}) {
  return new Promise((resolve, reject) => execFile(file, args, { timeout: PROCESS_TIMEOUT_MS, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error) return reject(new Error(`${path.basename(file)} failed: ${stderr || error.message}`));
    return resolve({ stdout, stderr });
  }));
}

async function getAudioDuration(file, dependencies = {}) {
  const runner = dependencies.execute || execute;
  const { stdout } = await runner('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file
  ]);
  const duration = Number.parseFloat(stdout);
  return Number.isFinite(duration) ? duration : 0;
}

async function ensureSafeDuration(inputPath, outputPath, dependencies = {}) {
  const inputDuration = await getAudioDuration(inputPath, dependencies);
  const outputDuration = await getAudioDuration(outputPath, dependencies);
  const minimumDuration = Math.max(1, inputDuration * 0.8);
  if (inputDuration > 1 && outputDuration < minimumDuration) {
    throw new Error(`Audio cleaner shortened the recording unexpectedly (${outputDuration.toFixed(2)}s / ${inputDuration.toFixed(2)}s).`);
  }
  return { inputDuration, outputDuration };
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Audio download exceeded redirect limit.'));
    const client = String(url).startsWith('https:') ? https : http;
    const request = client.get(url, { timeout: 30000 }, async response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        return resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, redirects + 1));
      }
      if (response.statusCode !== 200) { response.resume(); return reject(new Error(`Không thể tải audio (HTTP ${response.statusCode}).`)); }
      const length = Number(response.headers['content-length'] || 0);
      if (length > MAX_DOWNLOAD_BYTES) { response.resume(); return reject(new Error('Tệp audio vượt quá giới hạn 50 MB.')); }
      let received = 0;
      response.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) request.destroy(new Error('Tệp audio vượt quá giới hạn 50 MB.'));
      });
      try { await pipeline(response, fs.createWriteStream(destination)); resolve(destination); }
      catch (error) { reject(error); }
    });
    request.on('timeout', () => request.destroy(new Error('Hết thời gian tải audio.')));
    request.on('error', reject);
  });
}

async function cleanAudio(inputUrl, fileId, method = 'ai', dependencies = {}) {
  const normalizedMethod = ['ai', 'dsp'].includes(method) ? method : 'ai';
  const storage = dependencies.storage || storageService;
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'iig-audio-clean-'));
  const uniqueName = `${String(fileId).replace(/[^a-zA-Z0-9_-]/g, '_')}-${randomUUID()}`;
  const inputPath = path.join(workDir, `${uniqueName}-input.wav`);
  const wavPath = path.join(workDir, `${uniqueName}-clean.wav`);
  const mp3Path = path.join(workDir, `${uniqueName}-clean.mp3`);
  try {
    await (dependencies.download || downloadFile)(inputUrl, inputPath);
    const scriptPath = path.join(__dirname, 'audioCleaner.py');
    const pythonBinary = process.env.AUDIO_CLEANER_PYTHON || 'python3';
    const pythonResult = await (dependencies.execute || execute)(pythonBinary, [scriptPath, inputPath, wavPath, normalizedMethod]);
    await ensureSafeDuration(inputPath, wavPath, dependencies);
    await (dependencies.execute || execute)('ffmpeg', ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-ac', '1', '-ar', '16000', '-b:a', '96k', mp3Path]);

    const outputDir = path.join(__dirname, '../../public/cleaned-audio');
    const outputName = `${String(fileId).replace(/[^a-zA-Z0-9_-]/g, '_')}_cleaned.mp3`;
    storage.requireR2?.();
    if (storage.isR2Configured()) {
      const storedKey = await storage.uploadFile(mp3Path, storage.objectKey('cleaned', outputName));
      return { absolutePath: null, urlPath: storedKey, methodUsed: resolveMethod(pythonResult.stdout) };
    }
    await fsp.mkdir(outputDir, { recursive: true });
    const finalPath = path.join(outputDir, outputName);
    await fsp.copyFile(mp3Path, finalPath);
    return { absolutePath: finalPath, urlPath: `/cleaned-audio/${outputName}`, methodUsed: resolveMethod(pythonResult.stdout) };
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true });
  }
}

function resolveMethod(output = '') {
  if (output.includes('DeepFilterNet AI Denoising completed')) return 'ai';
  if (output.includes('FFmpeg Voice Enhancement v2 completed') || output.includes('FFmpeg Filter Chain completed')) return 'ffmpeg-v2';
  if (output.includes('DSP Spectral Gating completed')) return 'dsp';
  return 'original';
}

module.exports = { cleanAudio, downloadFile, execute, getAudioDuration, ensureSafeDuration, resolveMethod };
