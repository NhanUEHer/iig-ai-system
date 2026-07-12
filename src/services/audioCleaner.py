import sys
import os
import urllib.request
import numpy as np

# Ensure we have correct arguments
if len(sys.argv) < 3:
    print("Error: Missing arguments. Usage: python audioCleaner.py <input_path> <output_path> [method]")
    sys.exit(1)

input_path = sys.argv[1]
output_path = sys.argv[2]
method = sys.argv[3] if len(sys.argv) > 3 else "ai"

print(f"Cleaning audio file: {input_path} -> {output_path} (Method: {method})")

def normalize_audio_np(y, target_peak=0.95):
    """Normalize peak volume of a numpy array to target_peak."""
    peak = np.max(np.abs(y))
    if peak > 0:
        print(f"Normalizing audio (Numpy). Original peak: {peak:.4f} -> Target peak: {target_peak}")
        return y * (target_peak / peak)
    return y

try:
    if method == "ai":
        try:
            # Attempt to use DeepFilterNet (AI method)
            from df.enhance import enhance, init_df, load_audio, save_audio
            import torch
            
            print("Loading DeepFilterNet AI Model...")
            model, df_state = init_df()
            audio, info = load_audio(input_path, sr=df_state.sr())
            enhanced_audio = enhance(model, df_state, audio)
            
            # Normalize peak volume of the PyTorch tensor to 0.95
            max_val = torch.max(torch.abs(enhanced_audio))
            if max_val > 0:
                print(f"Normalizing audio (PyTorch). Original peak: {max_val.item():.4f} -> Target peak: 0.95")
                enhanced_audio = enhanced_audio * (0.95 / max_val)
                
            save_audio(output_path, enhanced_audio, df_state.sr())
            print("AI Denoising & Normalization Completed successfully.")
        except Exception as ai_err:
            print(f"Warning: AI Model error ({str(ai_err)}). Falling back to DSP method...")
            method = "dsp"

    if method == "dsp":
        import librosa
        import noisereduce as nr
        import soundfile as sf
        
        print("Running traditional DSP Spectral Gating...")
        # 1. Load original audio directly
        y, sr = librosa.load(input_path, sr=None, mono=True)
        
        # 2. Skip preemphasis (which boosts treble/tinny sounds and cuts warm bass)
        # 3. Apply noisereduce directly on original wave to preserve deep voice quality.
        # Set prop_decrease to 0.80 to avoid aggressive gating artifacts (metallic echo).
        reduced_noise = nr.reduce_noise(y=y, sr=sr, prop_decrease=0.80)
        
        # 4. Normalize peak volume
        normalized = normalize_audio_np(reduced_noise, 0.95)
        
        sf.write(output_path, normalized, sr)
        print("DSP Denoising & Normalization Completed successfully.")

except Exception as err:
    print(f"Fatal Error during noise reduction: {str(err)}")
    sys.exit(1)
