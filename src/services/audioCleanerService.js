const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const storageService = require('./storageService');

/**
 * Downloads a file from a URL to a local destination path
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const client = url.startsWith('https') ? https : http;

    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/**
 * Clean audio using Python audioCleaner script
 */
function cleanAudio(inputUrl, fileId, method = 'ai') {
  return new Promise(async (resolve, reject) => {
    const tempDir = path.join(__dirname, '../../tmp');
    const outputDir = path.join(__dirname, '../../public/cleaned-audio');

    // Ensure folders exist
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const tempInputFile = path.join(tempDir, `temp_input_${fileId}.wav`);
    const tempOutputFileWav = path.join(tempDir, `temp_output_${fileId}.wav`);
    const finalOutputFileMp3 = path.join(outputDir, `${fileId}_cleaned.mp3`);

    try {
      console.log(`[AudioCleaner] Downloading audio for cleaning...`);
      await downloadFile(inputUrl, tempInputFile);

      const scriptPath = path.join(__dirname, 'audioCleaner.py');
      console.log(`[AudioCleaner] Executing Python script: ${scriptPath}`);

      execFile('python3', [scriptPath, tempInputFile, tempOutputFileWav, method], async (error, stdout, stderr) => {
        // Clean up temporary downloaded file
        if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);

        if (error) {
          console.error(`[AudioCleaner] Script execution error:`, error, stderr);
          if (fs.existsSync(tempOutputFileWav)) fs.unlinkSync(tempOutputFileWav);
          reject(new Error(`Python processing error: ${error.message}`));
          return;
        }

        console.log(`[AudioCleaner] Output:\n${stdout}`);

        // 2. Convert WAV to MP3 using FFmpeg (mono, 96k bitrate, 16kHz sampling rate for STT optimization)
        const { exec } = require('child_process');
        exec(`ffmpeg -y -i "${tempOutputFileWav}" -codec:a libmp3lame -ac 1 -ar 16000 -b:a 96k "${finalOutputFileMp3}"`, async (ffErr, ffStdout, ffStderr) => {
          // Clean up temp WAV output
          if (fs.existsSync(tempOutputFileWav)) fs.unlinkSync(tempOutputFileWav);

          if (ffErr) {
            console.error(`[AudioCleaner] FFmpeg conversion error:`, ffErr, ffStderr);
            reject(new Error(`FFmpeg MP3 conversion error: ${ffErr.message}`));
            return;
          }

          console.log(`[AudioCleaner] FFmpeg conversion completed: ${finalOutputFileMp3}`);

          let finalUrlPath = `/cleaned-audio/${fileId}_cleaned.mp3`;
          let finalPath = finalOutputFileMp3;

          if (storageService.isR2Configured()) {
            const r2Key = `cleaned-audio/${fileId}_cleaned.mp3`;
            try {
              const storedKey = await storageService.uploadFile(finalOutputFileMp3, r2Key);
              finalUrlPath = storedKey; // "r2:cleaned-audio/xxx.mp3"
              finalPath = null;
              if (fs.existsSync(finalOutputFileMp3)) fs.unlinkSync(finalOutputFileMp3);
              console.log(`[AudioCleaner] Uploaded MP3 to R2: ${r2Key}`);
            } catch (r2Err) {
              console.warn(`[AudioCleaner] R2 upload failed, keeping local: ${r2Err.message}`);
            }
          }

          resolve({
            absolutePath: finalPath,
            urlPath: finalUrlPath,
            methodUsed: stdout.includes('traditional DSP') ? 'dsp' : 'ai'
          });
        });
      });

    } catch (err) {
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFileWav)) fs.unlinkSync(tempOutputFileWav);
      reject(err);
    }
  });
}

module.exports = {
  cleanAudio
};
