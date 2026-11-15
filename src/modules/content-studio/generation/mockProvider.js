'use strict';

// Mock content provider: returns deterministic, schema-correct sample output so the whole
// Content Studio flow (queue → validate → review → edit) can be exercised without Dify.

const STOP = new Set(('about above after again against because been before being below between both could does doing during each from further have having here into itself more most other ought same should some such than that their theirs them then there these they this those through under until very were what when where which while with would your yours will also only just like make made please let know').split(' '));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const words = text => (text.match(/[A-Za-z][A-Za-z'-]+/g) || []);
const LETTERS = ['A', 'B', 'C', 'D'];

function keywords(text, limit) {
  const seen = new Set();
  const result = [];
  for (const word of words(text)) {
    const lemma = word.toLowerCase().replace(/'s$/, '');
    if (lemma.length < 6 || STOP.has(lemma) || seen.has(lemma) || /^[A-Z]/.test(word)) continue;
    seen.add(lemma);
    result.push({ inText: word, lemma });
    if (result.length >= limit) break;
  }
  return result;
}

function bestSentence(sentences, text) {
  const target = new Set(words(text).map(word => word.toLowerCase()).filter(word => word.length > 3));
  let best = sentences[0] || '';
  let score = -1;
  for (const sentence of sentences) {
    const overlap = words(sentence).filter(word => target.has(word.toLowerCase())).length;
    if (overlap > score) { score = overlap; best = sentence; }
  }
  return best;
}

const vi = text => `(Bản dịch mẫu) ${text}`;

async function generate(type, input) {
  await delay(400 + Math.floor(Math.random() * 900));
  if (type === 'passage_translation') {
    return { sentences: input.sentences.map(en => ({ en, vi: vi(en) })) };
  }
  if (type === 'vocab') {
    return {
      settings: { level: input.level || 650, mode: input.mode || 'balanced' },
      items: keywords(input.passage, 10).map(item => ({ ...item, pos: 'Noun', ipa: '', meaningVi: `nghĩa của “${item.lemma}”` })),
    };
  }
  if (type === 'dictionary') {
    return {
      sentences: input.sentences.map((text, index) => ({
        index: index + 1,
        text,
        entries: keywords(text, 3).map(item => ({
          ...item, pos: 'Noun', ipa: '', meaningVi: `nghĩa của “${item.lemma}”`,
          meaningEn: `Definition of “${item.lemma}”.`,
          context: `Trong câu này, “${item.inText}” được dùng với nghĩa phổ biến nhất.`,
          example: { en: `This is an example with ${item.lemma}.`, vi: `Đây là ví dụ với ${item.lemma}.` },
          collocations: [], synonyms: [], wordFamily: [],
        })),
      })),
    };
  }
  if (type === 'question_pack') {
    const { question, sentences } = input;
    const answer = question.answerKey;
    const correct = answer ? question.options[answer] || '' : '';
    const quote = bestSentence(sentences, `${question.stem} ${correct}`);
    const wrong = LETTERS.filter(letter => letter !== answer && question.options[letter]);
    return {
      translation: {
        stem: vi(question.stem),
        options: Object.fromEntries(Object.entries(question.options).map(([letter, text]) => [letter, vi(text)])),
      },
      hint: `Xác định từ khoá trong câu hỏi rồi tìm đoạn thông tin tương ứng trong bài để so sánh với từng phương án.`,
      explanation: answer
        ? `Đáp án đúng là (${answer}) ${correct}. Trong bài có đề cập: “${quote}” Các phương án còn lại không phù hợp: ${wrong.map(letter => `(${letter}) ${question.options[letter]} không được nhắc tới hoặc sai thông tin`).join('; ')}.`
        : 'Chưa có đáp án đúng nên chưa thể giải thích.',
      note: 'Đọc kỹ toàn bộ thông tin liên quan trước khi chọn; các phương án sai thường lặp lại từ ngữ trong bài nhưng khác ý.',
    };
  }
  throw new Error(`Unsupported artifact type: ${type}`);
}

module.exports = { name: 'mock', generate };
