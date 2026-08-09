import sys
import os
import subprocess
import shutil

# Ensure we have correct arguments
if len(sys.argv) < 3:
    print("Error: Missing arguments. Usage: python audioCleaner.py <input_path> <output_path> [method]")
    sys.exit(1)

input_path = sys.argv[1]
output_path = sys.argv[2]
requested_method = sys.argv[3].lower() if len(sys.argv) > 3 else "auto"

print(f"[AudioCleaner] Processing: {input_path} -> {output_path} (Requested Method: {requested_method})")

def normalize_audio_np(y, target_peak=0.95):
    """Normalize peak volume of a numpy array to target_peak."""
    import numpy as np
    peak = np.max(np.abs(y))
    if peak > 0:
        print(f"[AudioCleaner] Normalizing audio (Numpy). Peak: {peak:.4f} -> Target: {target_peak}")
        return y * (target_peak / peak)
    return y

def run_ffmpeg_cleaner(inp, outp):
    """Voice-focused cleanup without removing natural pauses in speech."""
    print("[AudioCleaner] Running FFmpeg Voice Enhancement v2...")
    temp_mid = outp + ".mid.wav"
    try:
        # Step 1: isolate the speech band. Never stop at an internal pause:
        # FFmpeg treats the first natural pause as end-of-file and truncates the
        # rest of an otherwise valid speaking response.
        cmd_step1 = [
            "ffmpeg", "-y", "-nostdin",
            "-i", inp,
            "-af", "highpass=f=80,lowpass=f=8000",
            "-ar", "16000", "-ac", "1",
            temp_mid
        ]
        res1 = subprocess.run(cmd_step1, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        
        # Fallback if the initial band-pass conversion failed.
        if res1.returncode != 0 or not os.path.exists(temp_mid) or os.path.getsize(temp_mid) < 100:
            cmd_step1_fb = [
                "ffmpeg", "-y", "-nostdin",
                "-i", inp,
                "-af", "highpass=f=80,lowpass=f=8000",
                "-ar", "16000", "-ac", "1",
                temp_mid
            ]
            subprocess.run(cmd_step1_fb, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)

        # Step 2: adaptive FFT denoise + non-local-means broadband denoise + speech/loudness normalization.
        # This chain is deterministic and remains available when the optional DeepFilterNet runtime is absent.
        cmd_step2 = [
            "ffmpeg", "-y", "-nostdin",
            "-i", temp_mid,
            "-af", "afftdn=nr=18:nf=-35:tn=1,anlmdn=s=0.001:p=0.002:r=0.006,speechnorm=e=6.25:r=0.00001:l=1,loudnorm=I=-18:LRA=7:TP=-1.5",
            "-ar", "16000", "-ac", "1",
            outp
        ]
        res2 = subprocess.run(cmd_step2, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
        
        if res2.returncode == 0 and os.path.exists(outp) and os.path.getsize(outp) > 100:
            print("[AudioCleaner] FFmpeg Voice Enhancement v2 completed successfully.")
            return True
        return False
    except Exception as e:
        print(f"[AudioCleaner] FFmpeg Filter Chain exception: {str(e)}")
        return False
    finally:
        if os.path.exists(temp_mid):
            try: os.remove(temp_mid)
            except: pass

def run_ai_deepfilternet(inp, outp):
    """DeepFilterNet AI Noise Suppression"""
    print("[AudioCleaner] Attempting DeepFilterNet AI Model...")
    from df.enhance import enhance, init_df, load_audio, save_audio
    import torch

    model, df_state = init_df()
    audio, info = load_audio(inp, sr=df_state.sr())
    enhanced_audio = enhance(model, df_state, audio)

    # Peak normalization to 0.95
    max_val = torch.max(torch.abs(enhanced_audio))
    if max_val > 0:
        enhanced_audio = enhanced_audio * (0.95 / max_val)

    save_audio(outp, enhanced_audio, df_state.sr())
    print("[AudioCleaner] DeepFilterNet AI Denoising completed successfully.")
    return True

def run_dsp_noisereduce(inp, outp):
    """Traditional DSP Spectral Gating (noisereduce + librosa)"""
    print("[AudioCleaner] Running DSP Spectral Gating (noisereduce)...")
    import librosa
    import noisereduce as nr
    import soundfile as sf

    y, sr = librosa.load(inp, sr=16000, mono=True)
    reduced_noise = nr.reduce_noise(y=y, sr=sr, prop_decrease=0.80)
    normalized = normalize_audio_np(reduced_noise, 0.95)
    sf.write(outp, normalized, sr)
    print("[AudioCleaner] DSP Spectral Gating completed successfully.")
    return True

# ---------------------------------------------------------
# MAIN EXECUTION PIPELINE
# ---------------------------------------------------------
success = False

# 1. Try AI DeepFilterNet if requested or in auto mode
if requested_method in ["ai", "auto"]:
    try:
        success = run_ai_deepfilternet(input_path, output_path)
    except Exception as ai_err:
        print(f"[AudioCleaner] AI DeepFilterNet unavailable ({str(ai_err)}). Falling back to FFmpeg Filter Chain...")

# 2. Try FFmpeg Filter Chain if AI failed or if requested
if not success and requested_method in ["ffmpeg", "ai", "auto"]:
    try:
        success = run_ffmpeg_cleaner(input_path, output_path)
    except Exception as ff_err:
        print(f"[AudioCleaner] FFmpeg Filter Chain failed ({str(ff_err)}). Falling back to DSP Spectral Gating...")

# 3. Fallback to Python DSP Spectral Gating
if not success:
    try:
        success = run_dsp_noisereduce(input_path, output_path)
    except Exception as dsp_err:
        print(f"[AudioCleaner] DSP Spectral Gating failed ({str(dsp_err)}). Copying original input as last resort...")
        shutil.copyfile(input_path, output_path)

print("[AudioCleaner] Audio processing finished.")
