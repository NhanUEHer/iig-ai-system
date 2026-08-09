const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const drafts = new Map();
const ROOT = path.join(__dirname, '../..');
const tmpDir = path.join(ROOT, 'public/tmp_local');
const voicesDir = path.join(ROOT, 'public/local_voices');
const bridge = path.join(ROOT, 'src/models/openvoice/openvoice_bridge.py');

function engineInfo() {
  const python = process.env.OPENVOICE_PYTHON || path.join(ROOT, 'voice_clone_env/bin/python3');
  const modelRoot = process.env.OPENVOICE_MODEL_DIR || path.join(ROOT, 'voice_clone_models');
  return { id: 'openvoice-v2', name: 'OpenVoice V2', mode: 'local', python, modelRoot,
    ready: fs.existsSync(python) && fs.existsSync(bridge) && fs.existsSync(path.join(modelRoot, 'converter/config.json')),
    requirements: 'Python 3.9 · OpenVoice V2 checkpoints · MeloTTS', referenceSeconds: { min: 3, max: 30 } };
}

function run(reference, text, output, language = 'EN') {
  const engine = engineInfo();
  if (!engine.ready) return Promise.reject(Object.assign(new Error('OpenVoice V2 chưa được cài trên máy chủ.'), { code: 'VOICE_CLONE_ENGINE_UNAVAILABLE' }));
  return new Promise((resolve, reject) => execFile(engine.python, [bridge, reference, text, output, language, engine.modelRoot], { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => error ? reject(new Error(stderr || stdout || error.message)) : resolve(output)));
}

async function createPreview({ audioBase64, text, language = 'EN', consent = false }) {
  if (!consent) throw new Error('Bạn phải xác nhận có quyền sử dụng giọng nói này.');
  if (!audioBase64 || !text?.trim()) throw new Error('File giọng mẫu và nội dung nghe thử là bắt buộc.');
  const supportedLanguages = new Set(['EN', 'ES', 'FR', 'ZH', 'JP', 'KR']);
  const normalizedLanguage = String(language).toUpperCase();
  if (!supportedLanguages.has(normalizedLanguage)) throw new Error('Ngôn ngữ sao chép giọng không được hỗ trợ.');
  const engine = engineInfo();
  if (!engine.ready) throw Object.assign(new Error('OpenVoice V2 chưa được cài trên máy chủ.'), { code: 'VOICE_CLONE_ENGINE_UNAVAILABLE' });
  const id = crypto.randomUUID();
  const reference = path.join(tmpDir, `clone_ref_${id}.wav`);
  const preview = path.join(tmpDir, `clone_preview_${id}.wav`);
  const raw = String(audioBase64).replace(/^data:audio\/[^;]+;base64,/, '');
  const uploadBuffer = Buffer.from(raw, 'base64');
  if (!uploadBuffer.length || uploadBuffer.length > 15 * 1024 * 1024) throw new Error('File giọng mẫu không hợp lệ hoặc vượt quá 15 MB.');
  const uploaded = path.join(tmpDir, `clone_upload_${id}`);
  fs.writeFileSync(uploaded, uploadBuffer);
  await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', uploaded, '-ac', '1', '-ar', '24000', '-af', 'loudnorm=I=-20:TP=-3:LRA=9', reference], error => error ? reject(new Error('File audio không hợp lệ.')) : resolve()));
  fs.rmSync(uploaded, { force: true });
  const duration = await new Promise(resolve => execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', reference], (_error, stdout) => resolve(Number.parseFloat(stdout) || 0)));
  if (duration < 3 || duration > 30) { fs.rmSync(reference, { force: true }); throw new Error('Giọng mẫu phải dài từ 3 đến 30 giây.'); }
  try {
    await run(reference, text.trim(), preview, normalizedLanguage);
  } catch (error) {
    fs.rmSync(reference, { force: true });
    fs.rmSync(preview, { force: true });
    throw error;
  }
  drafts.set(id, { reference, preview, language: normalizedLanguage, createdAt: Date.now() });
  return { draftId: id, previewUrl: `/tmp_local/${path.basename(preview)}`, engine: 'openvoice-v2', referenceDuration: duration };
}

function consumeDraft(id, voiceName) {
  const draft = drafts.get(id);
  if (!draft || Date.now() - draft.createdAt > 60 * 60 * 1000) throw new Error('Bản nghe thử đã hết hạn. Vui lòng tạo lại.');
  const target = path.join(voicesDir, `openvoice_${id}.wav`);
  fs.renameSync(draft.reference, target);
  fs.rmSync(draft.preview, { force: true });
  drafts.delete(id);
  return { ...draft, reference: target, voiceName: voiceName.trim() };
}

module.exports = { engineInfo, createPreview, consumeDraft, synthesize: run };
