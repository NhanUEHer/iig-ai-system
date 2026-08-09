function parseTranscription(outputs) {
  let transcription = outputs?.transcribe || outputs?.text || '';
  if (outputs?.result) {
    try {
      const json = String(outputs.result).match(/\{[\s\S]*\}/)?.[0];
      const parsed = json ? JSON.parse(json) : null;
      if (parsed?.transcribe) transcription = parsed.transcribe;
    } catch (error) {
      // Some workflows return plain text in result; fall through to the standard fields.
    }
  }
  if (transcription) return transcription;
  return typeof outputs === 'object' ? JSON.stringify(outputs || {}) : String(outputs || '');
}

module.exports = parseTranscription;

