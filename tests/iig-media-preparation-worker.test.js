const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');

const processor = require('../src/modules/iig-ingestion/mediaProcessor');
const worker = require('../src/modules/iig-ingestion/mediaPreparationWorker');

const event = {
  id: '8a11ff0e-fb67-4dda-a4bc-adf3582f49bf',
  jobId: 'b3ec3a90-e447-4f88-b2e2-99ead7f32468',
  publishAttempts: 1,
  lockedBy: 'worker-1',
};

function asset(overrides = {}) {
  return {
    id: 'b5b8293d-83bd-4de0-86ba-17aacbc55aaf',
    exam_question_id: '21985f58-591b-420e-95d5-c94d3874f93d',
    question_attempt_id: null,
    asset_role: 'QUESTION_AUDIO',
    asset_index: 0,
    source_file_id: null,
    source_locator: { url: 'https://els3.iigvietnam.com/public/question.m3u8?signature=temporary' },
    ...overrides,
  };
}

test('media URL validation permits configured IIG hosts and blocks arbitrary hosts', () => {
  assert.match(processor.validateSourceUrl('https://els3.iigvietnam.com/public/a.m3u8'), /^https:/);
  assert.throws(
    () => processor.validateSourceUrl('https://127.0.0.1/internal'),
    error => error.code === 'IIG_MEDIA_URL_UNTRUSTED' && error.retryable === false
  );
});

test('media file IDs resolve through the token-free IIG file-view endpoint', async () => {
  let resolvedFileId;
  const url = await processor.resolveSourceUrl(asset({
    source_file_id: '9ea5d766-6173-4c51-a78c-d19cdbd1e730',
    source_locator: {},
  }), {
    iig: {
      getFileViewUrl: fileId => {
        resolvedFileId = fileId;
        return `https://elearningapi.iigvietnam.com/file/api/file-upload/${fileId}/view`;
      },
    },
  });
  assert.equal(resolvedFileId, '9ea5d766-6173-4c51-a78c-d19cdbd1e730');
  assert.equal(
    url,
    'https://elearningapi.iigvietnam.com/file/api/file-upload/9ea5d766-6173-4c51-a78c-d19cdbd1e730/view'
  );
});

test('audio metrics detect silence and valid speech-level signal', () => {
  const silent = processor.parseAudioMetrics(
    JSON.stringify({ format: { duration: '10.0', size: '1024' } }),
    'silence_duration: 9.9\nmean_volume: -80.0 dB\nmax_volume: -70.0 dB'
  );
  assert.equal(processor.audioQuality(silent).status, 'INVALID_AUDIO');
  const speech = processor.parseAudioMetrics(
    JSON.stringify({ format: { duration: '10.0', size: '120000' } }),
    'silence_duration: 1.2\nmean_volume: -24.0 dB\nmax_volume: -3.0 dB'
  );
  assert.equal(processor.audioQuality(speech).status, 'READY');
  assert.equal(speech.silenceRatio, 0.12);
});

test('media processor converts HLS audio to canonical MP3 and records quality', async () => {
  const calls = [];
  const result = await processor.processAsset(asset(), {
    resolveRedirects: async url => url,
    execute: async (file, args) => {
      calls.push([file, args]);
      if (file === 'ffprobe') {
        return { stdout: JSON.stringify({ format: { duration: '4.5', size: '54000' } }), stderr: '' };
      }
      if (args.at(-1) !== '-') await fsp.writeFile(args.at(-1), Buffer.from('audio'));
      return {
        stdout: '',
        stderr: args.at(-1) === '-'
          ? 'silence_duration: 0.5\nmean_volume: -22.0 dB\nmax_volume: -2.5 dB'
          : '',
      };
    },
    storage: {
      bucket: 'private-media',
      uploadFile: async (file, key) => {
        assert.equal(fs.existsSync(file), true);
        return `r2:${key}`;
      },
    },
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.canonicalMimeType, 'audio/mpeg');
  assert.equal(result.provider, 'R2');
  assert.equal(result.bucket, 'private-media');
  assert.equal(result.durationSeconds, 4.5);
  assert.equal(result.qualityMetrics.silenceRatio, 0.5 / 4.5);
  assert.match(result.key, /iig-ingestion\/questions\/.*\.mp3$/);
  assert.ok(calls.some(([file, args]) => file === 'ffmpeg' && args.includes('libmp3lame')));
});

test('student audio runs through voice cleanup before MP3 normalization', async () => {
  const calls = [];
  const result = await processor.processAsset(asset({
    exam_question_id: null,
    question_attempt_id: '6ba79d29-c4d3-460b-b312-1714c52e2592',
    asset_role: 'STUDENT_AUDIO',
  }), {
    resolveRedirects: async url => url,
    execute: async (file, args) => {
      calls.push([file, args]);
      if (file === 'ffprobe') {
        if (args.includes('json')) {
          return { stdout: JSON.stringify({ format: { duration: '5', size: '60000' } }), stderr: '' };
        }
        return { stdout: '5', stderr: '' };
      }
      if (file === 'python3') {
        await fsp.writeFile(args[2], Buffer.from('clean-audio'));
        return { stdout: 'FFmpeg Voice Enhancement v2 completed successfully.', stderr: '' };
      }
      if (args.at(-1) !== '-') await fsp.writeFile(args.at(-1), Buffer.from('audio'));
      return {
        stdout: '',
        stderr: args.at(-1) === '-'
          ? 'silence_duration: 0.2\nmean_volume: -20.0 dB\nmax_volume: -1.5 dB'
          : '',
      };
    },
    storage: {
      bucket: 'private-media',
      uploadFile: async (_file, key) => `r2:${key}`,
    },
  });
  assert.equal(result.status, 'READY');
  assert.equal(result.qualityMetrics.cleanupMethod, 'ffmpeg-v2');
  assert.ok(calls.some(([file, args]) => file === 'python3' && args[0].endsWith('audioCleaner.py')));
});

test('image media is copied to private storage with its canonical MIME type', async () => {
  let uploadedPath;
  const result = await processor.processAsset(asset({
    asset_role: 'QUESTION_IMAGE',
    source_locator: { url: 'https://han02.vstorage.vngcloud.vn/public/question.png' },
  }), {
    download: async (_url, destination) => {
      await fsp.writeFile(destination, Buffer.from('png-image'));
      return { contentType: 'image/png', size: 9 };
    },
    storage: {
      bucket: 'private-media',
      uploadFile: async (file, key) => {
        uploadedPath = file;
        return `r2:${key}`;
      },
    },
  });
  assert.equal(path.extname(uploadedPath), '.png');
  assert.equal(result.canonicalMimeType, 'image/png');
  assert.equal(result.provider, 'R2');
});

test('media worker preserves successful assets and continues past permanent asset failures', async () => {
  const calls = [];
  const assets = [asset({ id: 'asset-1' }), asset({ id: 'asset-2' })];
  const result = await worker.processEvent(event, {
    concurrency: 1,
    repository: {
      listPendingAssets: async () => assets,
      markAssetProcessing: async id => calls.push(['processing', id]),
      markAssetResult: async id => calls.push(['ready', id]),
      markAssetFailure: async id => calls.push(['failed', id]),
      markAssetRetry: async () => assert.fail('permanent errors must not retry'),
      markRetry: async () => assert.fail('permanent errors must not retry the event'),
      completeMedia: async () => ({ totalQuestions: 2, invalidQuestions: 1 }),
      markDeadLetter: async () => assert.fail('one bad asset must not dead-letter the submission'),
    },
    processor: {
      MediaProcessingError: processor.MediaProcessingError,
      processAsset: async media => {
        if (media.id === 'asset-2') {
          throw new processor.MediaProcessingError('not found', 'IIG_MEDIA_NOT_FOUND', false);
        }
        return { status: 'READY' };
      },
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(calls, [
    ['processing', 'asset-1'], ['ready', 'asset-1'],
    ['processing', 'asset-2'], ['failed', 'asset-2'],
  ]);
});

test('media worker processes at most two assets concurrently by default', async () => {
  const assets = Array.from({ length: 6 }, (_, index) => asset({ id: `asset-${index + 1}` }));
  let active = 0;
  let maxActive = 0;
  const result = await worker.processEvent(event, {
    repository: {
      listPendingAssets: async () => assets,
      markAssetProcessing: async () => {},
      markAssetResult: async () => {},
      markAssetFailure: async () => assert.fail('valid assets must not fail'),
      markAssetRetry: async () => assert.fail('valid assets must not retry'),
      markRetry: async () => assert.fail('valid assets must not retry the event'),
      completeMedia: async () => ({ totalQuestions: 6, invalidQuestions: 0 }),
      markDeadLetter: async () => assert.fail('valid assets must not dead-letter'),
    },
    processor: {
      processAsset: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setImmediate(resolve));
        active -= 1;
        return { status: 'READY' };
      },
    },
    concurrency: 2,
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.processed, 6);
  assert.equal(maxActive, 2);
});

test('media concurrency is clamped to the four-process safety limit', () => {
  assert.equal(worker.boundedInteger('3', 2, 1, 4), 3);
  assert.equal(worker.boundedInteger('20', 2, 1, 4), 4);
  assert.equal(worker.boundedInteger('invalid', 2, 1, 4), 2);
});

test('media worker retries a transient asset failure without reprocessing ready assets', async () => {
  let retry;
  const result = await worker.processEvent(event, {
    repository: {
      listPendingAssets: async () => [asset({ id: 'asset-retry' })],
      markAssetProcessing: async () => {},
      markAssetResult: async () => assert.fail('asset is not ready'),
      markAssetFailure: async () => assert.fail('first transient failure is not terminal'),
      markAssetRetry: async () => {},
      markRetry: async input => { retry = input; },
      completeMedia: async () => assert.fail('event must wait for retry'),
      markDeadLetter: async () => assert.fail('event must not dead-letter'),
    },
    processor: {
      processAsset: async () => {
        throw new processor.MediaProcessingError('upstream busy', 'IIG_MEDIA_HTTP_503', true);
      },
    },
    maxAttempts: 5,
  });
  assert.equal(result.status, 'retry');
  assert.equal(result.assetId, 'asset-retry');
  assert.equal(retry.delayMs, 10000);
});

test('media repository aggregates question and candidate assets before validation', () => {
  const root = path.resolve(__dirname, '..');
  const repository = fs.readFileSync(
    path.join(root, 'src/modules/iig-ingestion/mediaPreparationRepository.js'),
    'utf8'
  );
  const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');
  assert.match(repository, /FOR UPDATE SKIP LOCKED/);
  assert.match(repository, /asset\.question_attempt_id = attempt\.id/);
  assert.match(repository, /asset\.exam_question_id = attempt\.exam_question_id/);
  assert.match(repository, /INPUT_VALIDATION_REQUESTED/);
  assert.match(repository, /MEDIA_PREPARATION_COMPLETED/);
  assert.match(repository, /pending_questions = \$2::integer - \$3::integer/);
  assert.match(server, /iigMediaPreparationWorker\.startWorker/);
  assert.match(server, /iigMediaPreparationWorker\.stopWorker/);
});
