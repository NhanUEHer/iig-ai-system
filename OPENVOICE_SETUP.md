# OpenVoice V2 local runtime

Audio Studio integrates OpenVoice V2 as an optional, fully local voice-cloning engine. The API fails closed until the runtime and checkpoints below are present; it never substitutes a built-in or cloud voice.

## Runtime contract

- Python 3.9 in `voice_clone_env` (or set `OPENVOICE_PYTHON`)
- OpenVoice V2, MeloTTS, PyTorch and their dependencies installed in that environment
- Official V2 checkpoints in `voice_clone_models` (or set `OPENVOICE_MODEL_DIR`)
- Expected files include:
  - `converter/config.json`
  - `converter/checkpoint.pth`
  - `base_speakers/ses/en-us.pth` (plus the selected language embeddings)
- System commands `ffmpeg` and `ffprobe`

The runtime entrypoint is `src/models/openvoice/openvoice_bridge.py`. Keep this environment separate from `tts_env`, because Kokoro ONNX and OpenVoice have different Python dependency requirements.

## Server flow

1. `POST /api/local-tts/preview-cloned-voice` validates consent, file size and a 3–30 second recording.
2. FFmpeg converts the reference to mono 24 kHz WAV and normalizes loudness.
3. OpenVoice extracts the target speaker embedding, MeloTTS creates source speech, and the tone converter transfers the target voice.
4. A successful preview produces a one-hour draft ID.
5. `POST /api/local-tts/clone-voice` persists only that successful draft. The saved custom voice then appears in the passage and dialogue voice selectors.

Use only recordings for which the operator has explicit cloning rights. The UI and API both require that confirmation before synthesis.
