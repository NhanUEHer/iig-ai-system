const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('result page no longer exposes the unavailable detailed-solution action', () => {
  const page = read('exam-web/src/pages/ExamResultPage.jsx');
  assert.doesNotMatch(page, /Xem lời giải/);
  assert.doesNotMatch(page, /menu_book/);
  assert.match(page, /Làm lại bài thi/);
});

test('uploaded exam images have bounded responsive heights on desktop and mobile', () => {
  const page = read('exam-web/src/pages/ExamTestPage.jsx');
  const styles = read('exam-web/src/styles.css');
  assert.match(page, /className="listening-content-image"/);
  assert.match(styles, /\.listening-content-image[^}]*height:clamp\(240px,46vh,440px\)/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.listening-content-image[^}]*max-height:34dvh/);
  assert.match(styles, /object-fit:contain/);
});
