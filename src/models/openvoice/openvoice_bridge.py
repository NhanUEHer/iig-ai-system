import os, sys, torch
from openvoice import se_extractor
from openvoice.api import ToneColorConverter
from melo.api import TTS

reference, text, output, language, model_root = sys.argv[1:6]
source_embedding_names = {
    'EN': 'en-us', 'ES': 'es', 'FR': 'fr',
    'ZH': 'zh', 'JP': 'jp', 'KR': 'kr'
}
if language not in source_embedding_names:
    raise ValueError(f'Unsupported OpenVoice language: {language}')
device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
converter_dir = os.path.join(model_root, 'converter')
converter = ToneColorConverter(os.path.join(converter_dir, 'config.json'), device=device)
converter.load_ckpt(os.path.join(converter_dir, 'checkpoint.pth'))
target_se, _ = se_extractor.get_se(reference, converter, vad=True)
tts = TTS(language=language, device=device)
speaker_ids = tts.hps.data.spk2id
speaker_key = next(iter(speaker_ids.keys()))
source = output + '.source.wav'
tts.tts_to_file(text, speaker_ids[speaker_key], source, speed=1.0)
source_se = torch.load(os.path.join(model_root, 'base_speakers', 'ses', f'{source_embedding_names[language]}.pth'), map_location=device)
converter.convert(audio_src_path=source, src_se=source_se, tgt_se=target_se, output_path=output, message='IIG Workspace')
os.remove(source)
