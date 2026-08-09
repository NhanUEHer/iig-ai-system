const db = require('../config/db');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const voiceCloneService = require('./voiceCloneService');

class LocalTtsService {
  constructor() {
    this.audioDir = path.join(__dirname, '../../public/local_audio');
    this.voicesDir = path.join(__dirname, '../../public/local_voices');
    this.tmpDir = path.join(__dirname, '../../public/tmp_local');

    this.ensureDirsExist();
  }

  ensureDirsExist() {
    [this.audioDir, this.voicesDir, this.tmpDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  getEngineInfo() {
    const python = path.join(__dirname, '../../tts_env/bin/python3');
    const model = path.join(__dirname, '../models/kokoro/kokoro-v1.0.onnx');
    const voices = path.join(__dirname, '../models/kokoro/voices-v1.0.bin');
    return {
      id: 'kokoro-onnx', name: 'Kokoro 82M · ONNX', mode: 'local', language: 'English',
      ready: fs.existsSync(python) && fs.existsSync(model) && fs.existsSync(voices),
      capabilities: ['passage', 'multi-speaker', 'speed', 'pitch', 'expressive-style'],
      modelSizeMb: fs.existsSync(model) ? Math.round(fs.statSync(model).size / 1024 / 1024) : 0
    };
  }

  /**
   * Get built-in voices & custom cloned voices
   */
  async getVoices() {
    // 1. Prebuilt local voices (English only)
    const builtInVoices = [
      // ── English US — TOEIC Part 1-4 (American Accent) ───────────
      { id: 'en-US-AndrewNeural',      name: '🇺🇸 Andrew (Nam · Warm & Confident)',    language: 'en', gender: 'Male',   style: 'Conversation', isCustom: false },
      { id: 'en-US-AvaNeural',         name: '🇺🇸 Ava (Nữ · Expressive & Caring)',     language: 'en', gender: 'Female', style: 'Conversation', isCustom: false },
      { id: 'en-US-EmmaNeural',        name: '🇺🇸 Emma (Nữ · Cheerful & Clear)',       language: 'en', gender: 'Female', style: 'Conversation', isCustom: false },
      { id: 'en-US-BrianNeural',       name: '🇺🇸 Brian (Nam · Casual & Sincere)',      language: 'en', gender: 'Male',   style: 'Conversation', isCustom: false },
      { id: 'en-US-AriaNeural',        name: '🇺🇸 Aria (Nữ · News · Confident)',        language: 'en', gender: 'Female', style: 'News',         isCustom: false },
      { id: 'en-US-ChristopherNeural', name: '🇺🇸 Christopher (Nam · News · Authority)',language: 'en', gender: 'Male',   style: 'News',         isCustom: false },
      { id: 'en-US-JennyNeural',       name: '🇺🇸 Jenny (Nữ · General · Friendly)',     language: 'en', gender: 'Female', style: 'General',      isCustom: false },
      { id: 'en-US-GuyNeural',         name: '🇺🇸 Guy (Nam · News · Passionate)',       language: 'en', gender: 'Male',   style: 'News',         isCustom: false },
      { id: 'en-US-MichelleNeural',    name: '🇺🇸 Michelle (Nữ · News · Pleasant)',     language: 'en', gender: 'Female', style: 'News',         isCustom: false },
      { id: 'en-US-EricNeural',        name: '🇺🇸 Eric (Nam · News · Rational)',        language: 'en', gender: 'Male',   style: 'News',         isCustom: false },
      { id: 'en-US-RogerNeural',       name: '🇺🇸 Roger (Nam · News · Lively)',         language: 'en', gender: 'Male',   style: 'News',         isCustom: false },

      // ── English UK — TOEIC Part 1-4 (British Accent) ────────────
      { id: 'en-GB-SoniaNeural',  name: '🇬🇧 Sonia (Nữ · General · Friendly)',  language: 'en', gender: 'Female', style: 'General', isCustom: false },
      { id: 'en-GB-RyanNeural',   name: '🇬🇧 Ryan (Nam · General · Reliable)',   language: 'en', gender: 'Male',   style: 'General', isCustom: false },
      { id: 'en-GB-LibbyNeural',  name: '🇬🇧 Libby (Nữ · General · Positive)',  language: 'en', gender: 'Female', style: 'General', isCustom: false },
      { id: 'en-GB-ThomasNeural', name: '🇬🇧 Thomas (Nam · General · Calm)',     language: 'en', gender: 'Male',   style: 'General', isCustom: false },
      { id: 'en-GB-MaisieNeural', name: '🇬🇧 Maisie (Nữ · General · Youthful)', language: 'en', gender: 'Female', style: 'General', isCustom: false },

      // ── English AU — TOEIC (Australian Accent) ───────────────────
      { id: 'en-AU-NatashaNeural', name: '🇦🇺 Natasha (Nữ · General · Friendly)', language: 'en', gender: 'Female', style: 'General', isCustom: false },
      { id: 'en-AU-WilliamMultilingualNeural', name: '🇦🇺 William (Nam · Multilingual)', language: 'en', gender: 'Male', style: 'General', isCustom: false },
    ];

    // 2. Query custom cloned voices from DB
    try {
      const res = await db.query('SELECT * FROM local_voice_clones ORDER BY created_at DESC');
      const customVoices = res.rows.map(row => ({
        id: `custom_${row.id}`,
        db_id: row.id,
        name: `🧬 ${row.voice_name} (Voice Clone)`,
        language: row.language,
        gender: 'Custom',
        isCustom: true,
        ref_audio_url: `/local_voices/${path.basename(row.ref_audio_path)}`,
        ref_text: row.ref_text,
        created_at: row.created_at
      }));

      return [...customVoices, ...builtInVoices];
    } catch (err) {
      console.error('[LocalTtsService] Error fetching custom voices:', err);
      return builtInVoices;
    }
  }

  async saveClonedVoice({ voiceName, draftId }) {
    if (!voiceName?.trim() || !draftId) throw new Error('Tên giọng và bản nghe thử hợp lệ là bắt buộc.');
    const draft = voiceCloneService.consumeDraft(draftId, voiceName);
    const result = await db.query(`INSERT INTO local_voice_clones (voice_name,language,ref_audio_path,ref_text,engine,status)
      VALUES ($1,$2,$3,'','openvoice-v2','ready') RETURNING *`, [draft.voiceName, draft.language.toLowerCase(), draft.reference]);
    const row = result.rows[0];
    return { success: true, voice: { id: `custom_${row.id}`, db_id: row.id, name: `🧬 ${row.voice_name}`, language: row.language, isCustom: true, engine: row.engine } };
  }

  /**
   * Generate local audio from single passage or multi-speaker dialogue
   * @param {string} title
   * @param {string} content_type - 'dialogue' | 'passage'
   * @param {Array}  script       - [{speaker_name, text, voice_id, rate?, pitch?, pause_after_ms?}]
   * @param {string} global_rate  - e.g. "+0%", "-20%", "+30%" (default "+0%")
   * @param {string} global_pitch - e.g. "+0Hz", "+50Hz", "-30Hz" (default "+0Hz")
   * @param {number} pause_between_ms - silence gap between segments (ms, default 500)
   */
  async generateAudio({ title, content_type = 'dialogue', script,
                        global_rate = '+0%', global_pitch = '+0Hz', pause_between_ms = 500 }) {
    if (!script || !Array.isArray(script) || script.length === 0) {
      throw new Error('Kịch bản hội thoại/văn bản không được để trống.');
    }

    const timestamp = Date.now();
    const finalMp3File = path.join(this.audioDir, `local_audio_${timestamp}.mp3`);
    const tempAudioFiles = [];

    // English Text Normalization Helper to improve offline Kokoro-ONNX expression & pronunciation
    const normalizeEnglishText = (text) => {
      if (!text) return '';
      let t = text;
      
      // Expand common contractions to force the TTS model to emphasize words individually (making it sound professional)
      const contractions = {
        "I'm": "I am", "i'm": "i am",
        "you're": "you are", "You're": "You are",
        "he's": "he is", "He's": "He is",
        "she's": "she is", "She's": "She is",
        "it's": "it is", "It's": "It is",
        "we're": "we are", "We're": "We are",
        "they're": "they are", "They're": "They are",
        "I've": "I have", "you've": "you have", "You've": "You have",
        "we've": "we have", "We've": "We have",
        "they've": "they have", "They've": "They have",
        "I'll": "I will", "you'll": "you will", "You'll": "You will",
        "he'll": "he will", "He'll": "He will",
        "she'll": "she will", "She'll": "She will",
        "it'll": "it will", "It'll": "It will",
        "we'll": "we will", "We'll": "We will",
        "they'll": "they will", "They'll": "They will",
        "isn't": "is not", "Isn't": "Is not",
        "aren't": "are not", "Aren't": "Are not",
        "wasn't": "was not", "Wasn't": "Was not",
        "weren't": "were not", "Weren't": "Were not",
        "haven't": "have not", "Haven't": "Have not",
        "hasn't": "has not", "Hasn't": "Has not",
        "don't": "do not", "Don't": "Do not",
        "doesn't": "does not", "Doesn't": "Does not",
        "didn't": "did not", "Didn't": "Did not",
        "can't": "CANNOT", "Can't": "CANNOT",
        "couldn't": "could not", "Couldn't": "Could not",
        "shouldn't": "should not", "Shouldn't": "Should not",
        "wouldn't": "would not", "Wouldn't": "Would not",
        "won't": "will not", "Won't": "Will not"
      };

      for (const [key, val] of Object.entries(contractions)) {
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        t = t.replace(regex, val);
      }

      // 1. Add capitalization for key transition and emphasis words to force Kokoro pitch variations
      const emphasisWords = ['really', 'extremely', 'absolutely', 'never', 'always', 'important', 'urgent', 'immediately'];
      emphasisWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        t = t.replace(regex, word.toUpperCase());
      });

      // 2. Add structural formatting to force natural breathing and pacing pauses
      t = t.replace(/,\s*/g, ', ... ');          // Comma pauses
      t = t.replace(/\.\s*/g, '. ... ');          // Sentence boundaries
      t = t.replace(/\?\s*/g, '? ... ');          // Question pitch delay
      t = t.replace(/!\s*/g, '! ... ');          // Exclamation pitch delay
      t = t.replace(/;\s*/g, '; ... ');          // Semicolon pauses
      t = t.replace(/-\s*/g, ' - ... ');         // Dash pauses
      
      // Clean up any double ellipses
      t = t.replace(/\.\.\.\s*\.\.\./g, '...');
      
      return t;
    };

    // If it is a single passage, split it into sentences using delimiters (. ; ? !) to apply pauses
    let processedScript = [...script];
    if (content_type === 'passage' && script.length === 1) {
      const originalLine = script[0];
      const text = originalLine.text || '';
      
      // Split by sentence delimiters but keep the delimiter in the text group
      const sentences = text.match(/[^.!?;\n]+[.!?;\n]*/g) || [text];
      
      processedScript = sentences
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map((sentenceText, idx) => ({
          speaker_name: originalLine.speaker_name || 'Narrator',
          text: sentenceText,
          voice_id: originalLine.voice_id,
          rate: originalLine.rate,
          pitch: originalLine.pitch,
          pause_after_ms: pause_between_ms // Apply the global pause between each sentence
        }));
    }

    const activeScript = processedScript.filter(line => line.text?.trim());
    const parsePercent = value => 1 + (Number.parseFloat(String(value || '0').replace('%', '')) || 0) / 100;
    const parsePitch = value => Number.parseFloat(String(value || '0').replace('Hz', '')) || 0;
    const batchDir = path.join(this.tmpDir, `batch_${timestamp}`);
    const jobPath = path.join(this.tmpDir, `job_${timestamp}.json`);
    fs.mkdirSync(batchDir, { recursive: true });
    const preparedLines = await Promise.all(activeScript.map(async (line, index) => {
      if (!String(line.voice_id || '').startsWith('custom_')) return { line, index, custom: null };
      const voice = await db.query('SELECT * FROM local_voice_clones WHERE id = $1 AND status = $2', [String(line.voice_id).replace('custom_', ''), 'ready']);
      if (!voice.rows[0]) throw new Error('Giọng sao chép không tồn tại hoặc chưa sẵn sàng.');
      return { line, index, custom: voice.rows[0] };
    }));
    const builtInLines = preparedLines.filter(item => !item.custom);
    fs.writeFileSync(jobPath, JSON.stringify({
      script: builtInLines.map(({ line, index }) => ({
        index,
        text: line.text.trim(),
        voice_id: line.voice_id || 'en-US-AndrewNeural',
        speed: Math.max(.7, Math.min(1.3, parsePercent(line.rate || global_rate))),
        style: line.style || 'natural'
      }))
    }));
    const pythonBin = path.join(__dirname, '../../tts_env/bin/python3');
    const bridgeScript = path.join(__dirname, '../models/kokoro/kokoro_batch_bridge.py');
    if (builtInLines.length) await new Promise((resolve, reject) => execFile(pythonBin, [bridgeScript, jobPath, batchDir], { timeout: 10 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`Kokoro local synthesis failed: ${stderr || stdout || error.message}`));
      resolve();
    }));
    for (const item of preparedLines.filter(value => value.custom)) {
      await voiceCloneService.synthesize(item.custom.ref_audio_path, item.line.text.trim(), path.join(batchDir, `part_${String(item.index).padStart(3, '0')}.wav`), String(item.custom.language || 'en').toUpperCase());
    }

    // Post-process every turn. Pitch is applied here while keeping the requested tempo.
    for (let i = 0; i < activeScript.length; i++) {
      const line = activeScript[i];
      const tempWav = path.join(batchDir, `part_${String(i).padStart(3, '0')}.wav`);
      const tempFile = path.join(this.tmpDir, `part_${timestamp}_${i}.mp3`);
      const semitones = parsePitch(line.pitch || global_pitch) / 10;
      const factor = Math.pow(2, semitones / 12);
      const filter = `asetrate=24000*${factor.toFixed(5)},aresample=24000,atempo=${(1 / factor).toFixed(5)},loudnorm=I=-18:TP=-2:LRA=11`;
      await new Promise((resolve, reject) => execFile('ffmpeg', ['-y', '-i', tempWav, '-af', filter, '-ac', '1', '-ar', '24000', '-codec:a', 'libmp3lame', '-q:a', '2', tempFile], error => error ? reject(error) : resolve()));
      tempAudioFiles.push(tempFile);

      // Per-block pause after segment (except last)
      if (i < activeScript.length - 1) {
        const blockPauseMs = (line.pause_after_ms !== undefined && line.pause_after_ms !== null && line.pause_after_ms !== '')
          ? Number(line.pause_after_ms)
          : pause_between_ms;

        if (blockPauseMs > 0) {
          const blockSilenceFile = path.join(this.tmpDir, `silence_${timestamp}_${i}.mp3`);
          await new Promise(resolve => {
            execFile('ffmpeg', [
              '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono',
              '-t', String(blockPauseMs / 1000),
              '-q:a', '9', '-acodec', 'libmp3lame', blockSilenceFile
            ], () => resolve());
          });
          if (fs.existsSync(blockSilenceFile)) tempAudioFiles.push(blockSilenceFile);
        }
      }
    }
    try { fs.unlinkSync(jobPath); } catch {}
    fs.rmSync(batchDir, { recursive: true, force: true });

    // Merge generated temporary audio files into single final MP3
    if (tempAudioFiles.length === 0) {
      throw new Error('Không thể tổng hợp file âm thanh từ văn bản.');
    }

    if (tempAudioFiles.length === 1) {
      fs.copyFileSync(tempAudioFiles[0], finalMp3File);
    } else {
      // Concatenate files using ffmpeg concat protocol
      const concatListPath = path.join(this.tmpDir, `concat_${timestamp}.txt`);
      const concatContent = tempAudioFiles.map(f => `file '${f}'`).join('\n');
      fs.writeFileSync(concatListPath, concatContent);

      await new Promise((resolve) => {
        execFile('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', finalMp3File], (err) => {
          if (err) {
            console.warn('[LocalTtsService] FFmpeg concat fallback to first file:', err.message);
            fs.copyFileSync(tempAudioFiles[0], finalMp3File);
          }
          try { fs.unlinkSync(concatListPath); } catch (e) {}
          resolve();
        });
      });
    }

    // Clean up temporary audio parts
    tempAudioFiles.forEach(f => {
      try { fs.unlinkSync(f); } catch (e) {}
    });

    const publicAudioUrl = `/local_audio/${path.basename(finalMp3File)}`;
    const durationSeconds = await new Promise(resolve => execFile('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', finalMp3File
    ], (error, stdout) => resolve(error ? null : Number.parseFloat(stdout.trim()) || null)));
    const fileSizeBytes = fs.statSync(finalMp3File).size;

    // Save to CSDL PostgreSQL local_tts_history
    const queryText = `
      INSERT INTO local_tts_history (title, content_type, raw_script, audio_path, duration_seconds, engine, settings, file_size_bytes)
      VALUES ($1, $2, $3, $4, $5, 'kokoro-onnx', $6::jsonb, $7)
      RETURNING *;
    `;
    const values = [
      title || 'Untitled Audio',
      content_type,
      JSON.stringify(script),
      publicAudioUrl,
      durationSeconds,
      JSON.stringify({ global_rate, global_pitch, pause_between_ms }),
      fileSizeBytes
    ];

    const dbRes = await db.query(queryText, values);
    const savedRecord = dbRes.rows[0];

    return {
      success: true,
      audio_url: publicAudioUrl,
      record: savedRecord
    };
  }

  /**
   * Get history of generated audio clips
   */
  async getHistory({ page = 1, limit = 10, search = '' } = {}) {
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 10));
    const query = `%${String(search).trim()}%`;
    const [rows, count] = await Promise.all([
      db.query(`SELECT id,title,content_type,language,audio_path,duration_seconds,engine,settings,file_size_bytes,created_at,
        CASE WHEN jsonb_typeof(raw_script)='array' THEN jsonb_array_length(raw_script) ELSE 0 END AS segment_count
        FROM local_tts_history WHERE title ILIKE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [query, safeLimit, (safePage - 1) * safeLimit]),
      db.query('SELECT COUNT(*)::int AS total FROM local_tts_history WHERE title ILIKE $1', [query])
    ]);
    return { items: rows.rows, pagination: { page: safePage, limit: safeLimit, total: count.rows[0].total, totalPages: Math.max(1, Math.ceil(count.rows[0].total / safeLimit)) } };
  }

  async getHistoryDetail(id) {
    const res = await db.query('SELECT * FROM local_tts_history WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  /**
   * Delete history item
   */
  async deleteHistory(id) {
    const res = await db.query('DELETE FROM local_tts_history WHERE id = $1 RETURNING *', [id]);
    if (res.rows.length > 0) {
      const audioPath = res.rows[0].audio_path;
      if (audioPath) {
        const localFile = path.join(__dirname, '../../public', audioPath);
        if (fs.existsSync(localFile)) {
          try { fs.unlinkSync(localFile); } catch (e) {}
        }
      }
    }
    return res.rows[0];
  }

  /**
   * Delete custom cloned voice
   */
  async deleteClonedVoice(id) {
    const dbId = String(id).replace('custom_', '');
    const res = await db.query('DELETE FROM local_voice_clones WHERE id = $1 RETURNING *', [dbId]);
    if (res.rows.length > 0) {
      const refPath = res.rows[0].ref_audio_path;
      if (refPath && fs.existsSync(refPath)) {
        try { fs.unlinkSync(refPath); } catch (e) {}
      }
    }
    return res.rows[0];
  }
}

module.exports = new LocalTtsService();
