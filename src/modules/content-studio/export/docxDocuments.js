'use strict';

// DOCX documents that have no legacy equivalent: bilingual passage, question pack, whole lesson.
// Same look as learning-materials/learningMaterialDocumentExporter (Arial, blue headings, letter page).
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType,
  Footer, AlignmentType, PageNumber, ImageRun,
} = require('docx');

const BLUE = '155A9C', INK = '102A43', MUTED = '627D98', PALE = 'EDF5FC', GREEN = '2F6B45', AMBER = 'B26A00';
const clean = value => String(value ?? '').trim();
const LETTERS = ['A', 'B', 'C', 'D'];

function para(text, options = {}) {
  const lines = String(text ?? '').split('\n');
  return new Paragraph({
    children: lines.map((line, index) => new TextRun({ text: line, break: index ? 1 : 0, bold: options.bold, italics: options.italics, color: options.color || INK, size: options.size || 21 })),
    spacing: { before: options.before || 0, after: options.after ?? 100, line: 280 },
    keepNext: options.keepNext, indent: options.indent ? { left: options.indent } : undefined,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill } : undefined,
  });
}
const heading = (text, level = HeadingLevel.HEADING_1) => new Paragraph({ heading: level, children: [new TextRun({ text })], keepNext: true });
const label = (name, value, options = {}) => new Paragraph({
  children: [new TextRun({ text: `${name}: `, bold: true, color: BLUE, size: 21 }), new TextRun({ text: clean(value) || '—', color: options.color || INK, italics: options.italics, size: 21 })],
  spacing: { after: 100, line: 280 },
});

// Quotes “…” in an explanation are set in italics so the evidence stands out.
function explanationRuns(text) {
  return clean(text).split(/(“[^”]+”)/).filter(Boolean).map(part => new TextRun({ text: part, italics: part.startsWith('“'), size: 21, color: INK }));
}

function cell(text, { header = false, width, color } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: header ? { type: ShadingType.CLEAR, fill: PALE } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [para(text, { bold: header, color: color || (header ? BLUE : INK), after: 0 })],
  });
}

function document(title, subtitle, children) {
  return new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 21, color: INK }, paragraph: { spacing: { after: 100, line: 280 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 30, bold: true, color: BLUE }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', run: { font: 'Arial', size: 25, bold: true, color: BLUE }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT], color: MUTED, size: 17 })] })] }) },
      children: [
        new Paragraph({ children: [new TextRun({ text: 'CONTENT STUDIO · IIG eLEARNING', bold: true, color: BLUE, size: 18 })], spacing: { after: 90 } }),
        new Paragraph({ children: [new TextRun({ text: title, bold: true, color: INK, size: 36 })], spacing: { after: 70 } }),
        para(subtitle, { color: MUTED, size: 19, after: 200 }),
        ...children,
      ],
    }],
  });
}

// ---------- sections ----------
function bilingualSection(model) {
  const out = [heading('Song ngữ Anh – Việt')];
  model.passages.forEach((passage, index) => {
    if (model.passages.length > 1) out.push(heading(`Đoạn văn ${index + 1}`, HeadingLevel.HEADING_2));
    const rows = passage.sentences.length ? passage.sentences : [];
    if (!rows.length) { out.push(para('(Chưa có bản dịch)', { color: AMBER })); return; }
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ tableHeader: true, children: [cell('#', { header: true, width: 6 }), cell('Tiếng Anh', { header: true, width: 47 }), cell('Tiếng Việt', { header: true, width: 47 })] }),
        ...rows.map((row, i) => new TableRow({ cantSplit: true, children: [
          cell(`S${i + 1}`, { width: 6, color: MUTED }), cell(row.en, { width: 47 }),
          cell(clean(row.vi) || '(chưa dịch)', { width: 47, color: clean(row.vi) ? INK : AMBER }),
        ] })),
      ],
    }));
    // Interleaved: each English sentence followed by its translation in italics, one line per sentence.
    out.push(heading('Song ngữ xen kẽ', HeadingLevel.HEADING_2));
    for (const row of rows) {
      const vi = clean(row.vi);
      out.push(new Paragraph({
        children: [
          new TextRun({ text: clean(row.en), size: 21, color: INK }),
          new TextRun({ text: vi ? ` (${vi})` : ' (chưa dịch)', italics: true, size: 21, color: vi ? INK : AMBER }),
        ],
        spacing: { after: 60, line: 280 },
      }));
    }
    out.push(heading('Bản dịch liền mạch', HeadingLevel.HEADING_2));
    out.push(para(rows.map(row => clean(row.vi) || '(chưa dịch)').join(' '), { fill: PALE, after: 160 }));
  });
  return out;
}

function questionSection(model, { student = false } = {}) {
  const out = [heading(student ? 'Câu hỏi luyện tập' : 'Câu hỏi – Dịch, Hint, Explanation, Note')];
  for (const question of model.questions) {
    for (const image of question.images || []) {
      out.push(image.data
        ? new Paragraph({ children: [new ImageRun({ type: image.type, data: image.data, transformation: { width: image.width, height: image.height } })], spacing: { before: 160, after: 80 }, keepNext: true })
        : para(`[${image.missing}]`, { color: AMBER, before: 120 }));
    }
    const stem = clean(question.stem) || (question.images?.length ? '(Chọn câu mô tả đúng nhất bức tranh)' : '');
    out.push(para(`Câu ${question.number}. ${stem}`, { bold: true, size: 23, before: 160, keepNext: true }));
    for (const letter of LETTERS.filter(value => question.options?.[value])) {
      const correct = !student && question.answerKey === letter;
      out.push(new Paragraph({
        children: [new TextRun({ text: `(${letter}) ${clean(question.options[letter])}${correct ? '  ✓' : ''}`, bold: correct, color: correct ? GREEN : INK, size: 21 })],
        indent: { left: 360 }, spacing: { after: 40 }, keepNext: true,
      }));
    }
    const pack = question.pack;
    if (!pack) { out.push(para('(Chưa có nội dung cho câu này)', { color: AMBER, before: 80 })); continue; }
    out.push(para('Dịch câu hỏi & đáp án', { bold: true, color: BLUE, before: 120, after: 40, keepNext: true }));
    out.push(para(pack.translation, { fill: PALE, after: 100 }));
    out.push(label('Hint', pack.hint));
    if (!student) {
      out.push(new Paragraph({ children: [new TextRun({ text: 'Explanation: ', bold: true, color: BLUE, size: 21 }), ...explanationRuns(pack.explanation)], spacing: { after: 100, line: 280 } }));
      out.push(label('Note', pack.note));
    }
  }
  if (student) {
    out.push(heading('Đáp án'));
    out.push(para(model.questions.map(question => `${question.number}${question.answerKey || '?'}`).join('   ')));
  }
  return out;
}

function vocabSection(model) {
  if (!model.vocab.length) return [];
  return [heading('Key Vocab'), new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: ['Từ trong bài', 'Từ gốc', 'Loại', 'IPA', 'Nghĩa'].map((text, i) => cell(text, { header: true, width: [20, 20, 16, 20, 24][i] })) }),
      ...model.vocab.map(item => new TableRow({ cantSplit: true, children: [item.inText, item.lemma, item.pos, item.ipa, item.meaningVi].map((text, i) => cell(text, { width: [20, 20, 16, 20, 24][i] })) })),
    ],
  })];
}

function dictionarySection(model) {
  if (!model.dictionary.length) return [];
  const out = [heading('Từ điển theo ngữ cảnh')];
  model.dictionary.forEach((entry, index) => {
    out.push(para(`${index + 1}. ${clean(entry.lemma)}  ${clean(entry.ipa)}  (${clean(entry.pos)})`, { bold: true, size: 22, before: 120, keepNext: true }));
    // Same fields as the Dictionary XLSX: nothing is dropped, only laid out for reading.
    const list = value => (Array.isArray(value) ? value : String(value ?? '').split(/\n/)).map(clean).filter(Boolean);
    const family = Array.isArray(entry.wordFamily) ? list(entry.wordFamily).join(' - ') : clean(entry.wordFamily);
    out.push(label('Dạng trong bài', entry.inText));
    out.push(label('Nghĩa tiếng Việt', entry.meaningVi));
    out.push(label('Định nghĩa tiếng Anh', entry.meaningEn));
    out.push(label('Câu gốc', entry.sentence, { italics: true }));
    out.push(label('Ngữ cảnh', entry.context));
    out.push(label('Ví dụ', entry.example?.en ? `${entry.example.en}${entry.example.vi ? `\n→ ${entry.example.vi}` : ''}` : ''));
    out.push(label('Collocations', list(entry.collocations).join('; ')));
    out.push(label('Synonyms', list(entry.synonyms).join(', ')));
    out.push(label('Word family', family));
  });
  return out;
}

const subtitleOf = model => [model.part && `Part ${model.part}`, model.questionRange && `Câu ${model.questionRange}`, `Xuất ngày ${new Date().toLocaleDateString('vi-VN')}`].filter(Boolean).join(' · ');

function buildBilingual(model) { return Packer.toBuffer(document(model.title, subtitleOf(model), bilingualSection(model))); }
function buildQuestions(model, options) { return Packer.toBuffer(document(model.title, subtitleOf(model) + (options?.student ? ' · Bản học viên' : ' · Bản giáo viên'), questionSection(model, options))); }
function buildFull(model) {
  const passages = model.passages.flatMap((passage, index) => [
    heading(model.passages.length > 1 ? `Đoạn văn ${index + 1}` : 'Đoạn văn'),
    para(passage.text, { fill: PALE, after: 160 }),
  ]);
  return Packer.toBuffer(document(model.title, subtitleOf(model), [
    ...passages, ...bilingualSection(model), ...vocabSection(model), ...dictionarySection(model),
    ...(model.questions.length ? questionSection(model) : []),
  ]));
}

module.exports = { buildBilingual, buildQuestions, buildFull, explanationRuns };
