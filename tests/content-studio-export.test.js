const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { mapVocab, mapDictionary, fileName } = require('../src/modules/content-studio/export/exportService');
const keyVocabExporter = require('../src/modules/key-vocab/keyVocabExporter');
const dictionaryExporter = require('../src/modules/dictionary/dictionaryExporter');

const item = {
  id: 'i1', title: 'Letter · Câu 1–4', createdAt: '2026-11-19T00:00:00Z', tasks: { vocab: { level: 700, mode: 'phrase_focused' } },
  segments: [{ id: 'p1', kind: 'passage', text: 'I am writing in reference to the proposal.' }],
  artifacts: [{ type: 'vocab', segmentId: 'p1', content: { items: [
    { inText: 'cost estimates', lemma: 'cost estimate', pos: 'Noun Phrase', ipa: '/kɒst ˈestɪmət/', meaningVi: 'bản dự toán chi phí' },
  ] } }],
};

test('vocab maps to the legacy Key Vocab rows and the legacy workbook keeps its template', async () => {
  const detail = mapVocab(item);
  assert.deepEqual(detail.vocabularies, [{ o: 'cost estimates', t: 'cost estimate', p: 'Noun Phrase', i: '/kɒst ˈestɪmət/', m: 'bản dự toán chi phí' }]);
  assert.equal(detail.target_score, 700);
  const zip = await JSZip.loadAsync(await keyVocabExporter.createWorkbook(detail.vocabularies));
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheet, /cost estimates/);
  assert.match(sheet, /A2/);
});

test('dictionary maps ready entries to completed legacy candidates, skips the rest, exports 12 columns', async () => {
  const content = {
    inText: 'writing', lemma: 'write', pos: 'Verb', ipa: '/raɪt/', meaningVi: 'viết', meaningEn: 'to compose',
    sentence: 'I am writing in reference to the proposal.', context: 'Ngữ cảnh.', example: { en: 'I write.', vi: 'Tôi viết.' },
    collocations: ['write to - viết cho'], synonyms: ['compose'], wordFamily: ['writer (n)', 'written (adj)'],
  };
  const client = { async query() { return { rows: [
    { status: 'ready', chunk: 'writing', content, sentence: content.sentence },
    { status: 'needs_review', chunk: 'proposal', content: null, sentence: content.sentence },
  ] }; } };
  const detail = await mapDictionary(item, client);
  assert.equal(detail.skipped, 1);
  assert.equal(detail.candidates[0].status, 'completed');
  assert.equal(detail.candidates[0].wordFamily, 'writer (n) - written (adj)');
  const zip = await JSZip.loadAsync(await dictionaryExporter.createWorkbook(detail.candidates));
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheet, /I am WRITING in reference to the proposal/);
  assert.match(sheet, /writer \(n\) – written \(adj\)/);
  assert.doesNotMatch(sheet, />proposal</);
});

test('export file names are ASCII and keep the legacy prefixes', () => {
  assert.equal(fileName(item, 'vocab', 'xlsx'), 'KeyVocabulary_Letter_Cau_1_4.xlsx');
  assert.equal(fileName(item, 'dictionary', 'docx'), 'VocabularyDictionary_Letter_Cau_1_4.docx');
});

test('bilingual, question (teacher/student) and full DOCX contain the expected content', async () => {
  const JSZipLocal = require('jszip');
  const docx = require('../src/modules/content-studio/export/docxDocuments');
  const model = {
    title: 'Letter', part: 7, questionRange: '1–1',
    passages: [{ text: 'One. Two.', sentences: [{ en: 'One.', vi: 'Một.' }, { en: 'Two.', vi: '' }] }],
    questions: [{ number: 1, stem: 'Why?', options: { A: 'a', B: 'b' }, answerKey: 'B', pack: { translation: 'Tại sao?\n(A) a\n(B) b', hint: 'Đọc câu 1.', explanation: 'Đáp án đúng là (B) b. “One sentence quoted here.” (A) sai.', note: 'Lưu ý.' } }],
    vocab: [{ inText: 'one', lemma: 'one', pos: 'Noun', ipa: '/wʌn/', meaningVi: 'một' }], dictionary: [],
  };
  const text = async buffer => (await (await JSZipLocal.loadAsync(await buffer)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, ' ');
  const bilingual = await text(docx.buildBilingual(model));
  assert.match(bilingual, /Một\./); assert.match(bilingual, /\(chưa dịch\)/); assert.match(bilingual, /Part 7 · Câu 1–1/);
  const teacher = await text(docx.buildQuestions(model));
  assert.match(teacher, /✓/); assert.match(teacher, /Explanation/);
  const student = await text(docx.buildQuestions(model, { student: true }));
  assert.doesNotMatch(student, /✓|Explanation/); assert.match(student, /Đáp án/); assert.match(student, /1B/);
  const full = await text(docx.buildFull(model));
  assert.match(full, /Key Vocab/); assert.match(full, /Song ngữ/);
});
