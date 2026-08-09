import json
import os
import sys
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(ROOT, 'kokoro-v1.0.onnx')
VOICES = os.path.join(ROOT, 'voices-v1.0.bin')

VOICE_MAP = {
    'en-US-AndrewNeural': 'am_adam', 'en-US-BrianNeural': 'am_liam',
    'en-US-ChristopherNeural': 'am_michael', 'en-US-GuyNeural': 'am_onyx',
    'en-US-EricNeural': 'am_eric', 'en-US-RogerNeural': 'am_fenrir',
    'en-US-AvaNeural': 'af_heart', 'en-US-EmmaNeural': 'af_bella',
    'en-US-AriaNeural': 'af_nova', 'en-US-JennyNeural': 'af_sarah',
    'en-US-MichelleNeural': 'af_nicole', 'en-GB-SoniaNeural': 'bf_alice',
    'en-GB-LibbyNeural': 'bf_lily', 'en-GB-MaisieNeural': 'bf_emma',
    'en-GB-RyanNeural': 'bm_george', 'en-GB-ThomasNeural': 'bm_lewis',
    'en-AU-NatashaNeural': 'af_jessica', 'en-AU-WilliamMultilingualNeural': 'am_echo'
}

def expressive_text(text, style):
    text = ' '.join(str(text).strip().split())
    if style == 'question' and not text.endswith('?'):
        text += '?'
    elif style == 'excited' and text[-1:] not in '!?':
        text += '!'
    elif style == 'thoughtful':
        text = text.replace(',', ', ...').replace(';', '; ...')
    elif style == 'serious':
        text = text.replace('!', '.').replace('?', '? ...')
    return text

def main():
    if len(sys.argv) != 3:
        raise ValueError('Usage: kokoro_batch_bridge.py <job.json> <output_dir>')
    with open(sys.argv[1], encoding='utf-8') as handle:
        job = json.load(handle)
    output_dir = sys.argv[2]
    os.makedirs(output_dir, exist_ok=True)
    engine = Kokoro(MODEL, VOICES)
    outputs = []
    for fallback_index, line in enumerate(job.get('script', [])):
        index = int(line.get('index', fallback_index))
        voice = VOICE_MAP.get(line.get('voice_id'), line.get('voice_id', 'am_adam'))
        if voice not in engine.voices.files:
            voice = 'am_adam'
        speed = max(.7, min(1.3, float(line.get('speed', 1))))
        text = expressive_text(line.get('text', ''), line.get('style', 'natural'))
        samples, sample_rate = engine.create(text, voice=voice, speed=speed, lang='en-us')
        output = os.path.join(output_dir, f'part_{index:03d}.wav')
        sf.write(output, samples, sample_rate)
        outputs.append({'index': index, 'path': output, 'sample_rate': sample_rate})
    print(json.dumps({'success': True, 'engine': 'kokoro-onnx', 'outputs': outputs}))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'success': False, 'error': str(error)}))
        sys.exit(1)
