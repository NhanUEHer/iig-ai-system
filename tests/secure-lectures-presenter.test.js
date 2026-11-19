const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { parseSecureLectureSlideHash } = require('../src/modules/secure-lectures/assets/guard');

test('presenter parses supported slide hashes and keeps custom hashes stable', () => {
  assert.equal(parseSecureLectureSlideHash('#slide2'), 'slide-2');
  assert.equal(parseSecureLectureSlideHash('#SLIDE003'), 'slide-3');
  assert.equal(parseSecureLectureSlideHash('#7'), 'slide-7');
  assert.equal(parseSecureLectureSlideHash('#chapter-intro'), '#chapter-intro');
  assert.equal(parseSecureLectureSlideHash(''), 'default');
});

test('guard observes history replacement without consuming lecture navigation keys', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/modules/secure-lectures/assets/guard.js'), 'utf8');
  const windowListeners = {};
  const documentListeners = {};
  const messages = [];
  const parent = { postMessage(message) { messages.push(message); } };
  const window = {
    location: { hash: '' },
    parent,
    history: {
      pushState(_state, _title, url) { window.location.hash = url || ''; },
      replaceState(_state, _title, url) { window.location.hash = url || ''; },
    },
    addEventListener(name, listener) { windowListeners[name] = listener; },
  };
  const document = {
    head: { appendChild() {} },
    documentElement: { setAttribute() {}, removeAttribute() {} },
    createElement() { return {}; },
    addEventListener(name, listener) { documentListeners[name] = listener; },
  };
  vm.runInNewContext(source, { window, document, module: { exports: {} }, Boolean, Number, String });
  assert.deepEqual({ ...messages[0] }, { type: 'sl:slide', key: 'default' });
  window.history.replaceState(null, '', '#slide2');
  assert.deepEqual({ ...messages.at(-1) }, { type: 'sl:slide', key: 'slide-2' });

  let prevented = false;
  documentListeners.keydown({
    key: 'ArrowRight', target: null, preventDefault() { prevented = true; }, stopPropagation() {},
  });
  assert.equal(prevented, false);
  assert.equal(messages.filter(message => message.type === 'sl:key').length, 0);
  windowListeners.message({ source: parent, data: { type: 'sl:tool', drawing: true } });
  documentListeners.keydown({
    key: 'P', target: null, preventDefault() { prevented = true; }, stopPropagation() {},
  });
  assert.equal(prevented, true);
  assert.deepEqual({ ...messages.at(-1) }, { type: 'sl:key', key: 'P', ctrl: false, shift: false });
});

test('annotation storage serializes data, compacts coordinates, and never includes raw token in key', async () => {
  const {
    annotationStorageKey, createAnnotationStore, serializeAnnotationData,
  } = await import('../frontend/src/features/secure-lectures/viewer/presenter/annotationStore.js');
  const token = 'this-is-a-raw-secret-token-value';
  const key = await annotationStorageKey(token, async value => {
    assert.equal(value, token);
    return 'abcdef0123456789fedcba9876543210';
  });
  assert.equal(key, 'sl:annot:v1:abcdef0123456789');
  assert.equal(key.includes(token), false);

  const data = {
    slides: { 'slide-2': [{ id: 's1', tool: 'pen', color: '#f00', width: 3, points: [[0.12345678, 0.98765432]] }] },
    notes: { 'slide-2': 'Nhắc ví dụ' },
    updatedAt: '2026-11-19T00:00:00.000Z',
  };
  const full = JSON.stringify(data);
  const compacted = serializeAnnotationData(data, full.length - 3);
  assert.equal(JSON.parse(compacted).slides['slide-2'][0].points[0][0], 0.123);

  const memory = new Map();
  const storage = {
    getItem: storageKey => memory.get(storageKey) || null,
    setItem: (storageKey, value) => memory.set(storageKey, value),
  };
  const store = await createAnnotationStore({
    token,
    storage,
    hashToken: async () => '0123456789abcdef0123456789abcdef',
    delay: 1,
  });
  store.schedule(data);
  assert.equal(store.flush(), true);
  assert.deepEqual(store.load().notes, data.notes);
  store.destroy();
});

test('annotation storage reports a hard size limit after coordinate compaction', async () => {
  const { serializeAnnotationData } = await import('../frontend/src/features/secure-lectures/viewer/presenter/annotationStore.js');
  assert.throws(
    () => serializeAnnotationData({ slides: {}, notes: { default: 'x'.repeat(200) } }, 40),
    error => error.code === 'ANNOTATION_TOO_LARGE',
  );
});

test('undo and redo histories are isolated by slide and include clear/remove operations', async () => {
  const {
    annotationHistoryReducer, createAnnotationHistory, currentStrokes,
  } = await import('../frontend/src/features/secure-lectures/viewer/presenter/annotationHistory.js');
  const a = { id: 'a', points: [[0, 0]], width: 3 };
  const b = { id: 'b', points: [[1, 1]], width: 3 };
  let state = createAnnotationHistory();
  state = annotationHistoryReducer(state, { type: 'add', slideKey: 'slide-2', stroke: a });
  state = annotationHistoryReducer(state, { type: 'add', slideKey: 'slide-3', stroke: b });
  state = annotationHistoryReducer(state, { type: 'remove', slideKey: 'slide-2', strokeId: 'a' });
  state = annotationHistoryReducer(state, { type: 'undo', slideKey: 'slide-2' });
  assert.deepEqual(currentStrokes(state, 'slide-2'), [a]);
  assert.deepEqual(currentStrokes(state, 'slide-3'), [b]);
  state = annotationHistoryReducer(state, { type: 'clear', slideKey: 'slide-2' });
  state = annotationHistoryReducer(state, { type: 'undo', slideKey: 'slide-2' });
  state = annotationHistoryReducer(state, { type: 'redo', slideKey: 'slide-2' });
  assert.deepEqual(currentStrokes(state, 'slide-2'), []);
});

test('normalized coordinates round-trip and eraser hit-testing works on whole strokes', async () => {
  const {
    hitTestStroke, normalizePoint, pointToPixel,
  } = await import('../frontend/src/features/secure-lectures/viewer/presenter/geometry.js');
  const normalized = normalizePoint(60, 45, { left: 10, top: 20, width: 200, height: 100 }, 0.5);
  assert.deepEqual(normalized, [0.25, 0.25, 0.5]);
  assert.deepEqual(pointToPixel(normalized, 800, 400), [200, 100, 0.5]);
  const stroke = { width: 4, points: [[0.1, 0.5], [0.9, 0.5]] };
  assert.equal(hitTestStroke(stroke, [0.5, 0.51], 1000, 500), true);
  assert.equal(hitTestStroke(stroke, [0.5, 0.8], 1000, 500), false);
});
