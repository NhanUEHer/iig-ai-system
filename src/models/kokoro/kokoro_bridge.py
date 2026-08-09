import sys
import os
import json
import soundfile as sf
import numpy as np

# Thêm đường dẫn thư mục hiện tại để Python tìm thấy model files dễ hơn
current_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(current_dir, "kokoro-v1.0.onnx")
voices_path = os.path.join(current_dir, "voices-v1.0.bin")

try:
    from kokoro_onnx import Kokoro
except ImportError:
    print(json.dumps({"success": False, "error": "kokoro-onnx library not installed in venv."}))
    sys.exit(1)

def main():
    if len(sys.argv) < 5:
        print(json.dumps({"success": False, "error": "Missing arguments. Usage: python kokoro_bridge.py <text> <voice_id> <output_path> <rate_percentage>"}))
        sys.exit(1)
        
    text = sys.argv[1]
    voice_id = sys.argv[2]
    output_path = sys.argv[3]
    rate_str = sys.argv[4]  # e.g., "+10%", "-20%"
    
    # Parse rate percentage to float speed multiplier (e.g. "+10%" -> 1.1, "-20%" -> 0.8)
    speed = 1.0
    try:
        if rate_str.endswith('%'):
            val = float(rate_str.replace('%', ''))
            speed = 1.0 + (val / 100.0)
    except Exception:
        pass
        
    if not os.path.exists(model_path) or not os.path.exists(voices_path):
        print(json.dumps({"success": False, "error": f"Model files not found. Ensure kokoro-v1.0.onnx and voices-v1.0.bin are in {current_dir}"}))
        sys.exit(1)
        
    try:
        kokoro = Kokoro(model_path, voices_path)
        
        # Map or validate voice_id directly with Kokoro built-in voices
        # Kokoro voices typically use prefixes like 'af_bella', 'am_adam', etc.
        voice_style = voice_id.strip()
        
        # If the requested voice_id is not in Kokoro's voices list, map standard names
        if voice_style not in kokoro.voices:
            is_male = any(x in voice_style.lower() for x in ['male', 'andrew', 'brian', 'christopher', 'eric', 'guy', 'roger', 'ryan', 'thomas', 'william', 'adam'])
            voice_style = 'am_adam' if is_male else 'af_bella'
        
        # Sinh audio trực tiếp cho Tiếng Anh
        samples, sample_rate = kokoro.create(text, voice=voice_style, speed=speed, lang="en-us")
        
        # Ghi ra file audio WAV
        sf.write(output_path, samples, sample_rate)
        
        print(json.dumps({"success": True, "output_path": output_path}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
