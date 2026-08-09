const localTtsService = require('../services/localTtsService');
const voiceCloneService = require('../services/voiceCloneService');

exports.getEngine = async (_req, res) => res.json({ success: true, engine: localTtsService.getEngineInfo(), voiceCloneEngine: voiceCloneService.engineInfo() });

exports.getVoices = async (req, res) => {
  try {
    const voices = await localTtsService.getVoices();
    return res.json({ success: true, voices });
  } catch (err) {
    console.error('[LocalTTSController] Get Voices Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.cloneVoice = async (req, res) => {
  try {
    const result = await localTtsService.saveClonedVoice({ voiceName: req.body?.voice_name, draftId: req.body?.draft_id });
    return res.json(result);
  } catch (err) {
    console.error('[LocalTTSController] Clone Voice Error:', err);
    return res.status(400).json({ success: false, error: err.message });
  }
};

exports.previewClonedVoice = async (req, res) => {
  try {
    const result = await voiceCloneService.createPreview({ audioBase64: req.body?.audio_base64, text: req.body?.test_text, language: req.body?.language || 'EN', consent: req.body?.consent === true });
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[LocalTTSController] Preview Voice Error:', err);
    return res.status(err.code === 'VOICE_CLONE_ENGINE_UNAVAILABLE' ? 503 : 400).json({ success: false, error: err.message });
  }
};

exports.generateAudio = async (req, res) => {
  try {
    const { title, content_type, script, global_rate, global_pitch, pause_between_ms } = req.body;
    const result = await localTtsService.generateAudio({
      title,
      content_type,
      script,
      global_rate,
      global_pitch,
      pause_between_ms
    });
    return res.json(result);
  } catch (err) {
    console.error('[LocalTTSController] Generate Audio Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const result = await localTtsService.getHistory(req.query);
    return res.json({ success: true, history: result.items, pagination: result.pagination });
  } catch (err) {
    console.error('[LocalTTSController] Get History Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.getHistoryDetail = async (req, res) => {
  const item = await localTtsService.getHistoryDetail(req.params.id);
  if (!item) return res.status(404).json({ success: false, error: 'Không tìm thấy audio trong lịch sử.' });
  return res.json({ success: true, data: item });
};

exports.deleteHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await localTtsService.deleteHistory(id);
    return res.json({ success: true, deleted });
  } catch (err) {
    console.error('[LocalTTSController] Delete History Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteClonedVoice = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await localTtsService.deleteClonedVoice(id);
    return res.json({ success: true, deleted });
  } catch (err) {
    console.error('[LocalTTSController] Delete Cloned Voice Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
