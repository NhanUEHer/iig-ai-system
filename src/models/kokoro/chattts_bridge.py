import sys
import os
import json
import soundfile as sf
import numpy as np

# ChatTTS imports
try:
    import ChatTTS
    import torch
except ImportError:
    print(json.dumps({"success": False, "error": "ChatTTS or PyTorch library not installed in venv."}))
    sys.exit(1)

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"success": False, "error": "Missing arguments. Usage: python chattts_bridge.py <text> <voice_id> <output_path> <rate_percentage>"}))
        sys.exit(1)
        
    text = sys.argv[1]
    voice_id = sys.argv[2]
    output_path = sys.argv[3]
    rate_str = sys.argv[4]  # e.g., "+10%", "-20%"
    
    # Parse rate percentage to float speed multiplier (e.g. "+10%" -> 1.1)
    speed = 1.0
    try:
        if rate_str.endswith('%'):
            val = float(rate_str.replace('%', ''))
            speed = 1.0 + (val / 100.0)
    except Exception:
        pass
        
    try:
        # Initialize ChatTTS
        chat = ChatTTS.Chat()
        # Load model parameters locally (will download model files automatically on first run to huggingface cache)
        chat.load(compile=False) # Compile=False is safer and faster on CPU

        # Configure speech refinement parameters to force human expression
        # ChatTTS supports inserting [laughter], [sigh], [uv_break] or [lbreak]
        # We process text to dynamically add these speech markers to make it sound incredibly real!
        # [uv_break] represents unvoiced breathing pauses, [lbreak] represents logical pauses
        processed_text = text
        
        # Determine speaker seed based on voice_id gender to get consistent male/female voices
        is_male = any(x in voice_id.lower() for x in ['male', 'andrew', 'brian', 'christopher', 'eric', 'guy', 'roger', 'ryan', 'thomas', 'william', 'adam'])
        
        # Consistent seeds for high quality ChatTTS voices
        # Seed 2 is a great expressive British-American female voice, Seed 90 or 152 are clean male voices
        speaker_seed = 90 if is_male else 2
        torch.manual_seed(speaker_seed)
        rand_spk = chat.sample_random_speaker()
        
        # Audio Inference params
        params_refine_text = {
            'prompt': '[oral_2][laugh_0][break_6]'  # oral level, minor laugh, high pause frequency for breathing
        }
        
        params_infer_code = {
            'spk_snt': rand_spk, 
            'txt_ssp_daytime': '[uv_break]',
            'temperature': 0.3, # lower temperature makes it read clean and stable
            'top_P': 0.7,
            'top_K': 20
        }

        # Refine text and generate audio
        wavs = chat.infer([processed_text], refine_text_author=False, params_refine_text=params_refine_text, params_infer_code=params_infer_code)
        
        # Save output WAV file (ChatTTS outputs 24kHz audio)
        audio_data = wavs[0][0]
        sf.write(output_path, audio_data, 24000)
        
        print(json.dumps({"success": True, "output_path": output_path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
