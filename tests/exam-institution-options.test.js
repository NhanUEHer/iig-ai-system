const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const dataModuleUrl = pathToFileURL(
  path.join(__dirname, '..', 'exam-web', 'src', 'data', 'landingData.js'),
).href;

test('candidate institution options are canonical, complete and unique', async () => {
  const { institutions } = await import(dataModuleUrl);

  assert.equal(institutions.length, 120);
  assert.equal(new Set(institutions).size, institutions.length);

  const requiredOptions = [
    'Trường Đại học Công đoàn',
    'Trường Đại học Kinh tế - Kỹ thuật Công nghiệp',
    'Trường Đại học Mở Hà Nội',
    'Trường Đại học Công nghệ Giao thông vận tải',
    'Trường Đại học Thủ đô Hà Nội',
    'Trường Đại học Lao động - Xã hội',
    'Trường Đại học Tài nguyên và Môi trường Hà Nội',
    'Trường Đại học Tài chính - Ngân hàng Hà Nội',
    'Học viện Chính sách và Phát triển',
    'Học viện Kỹ thuật Quân sự',
    'Học viện Kỹ thuật Mật mã',
    'Học viện Hành chính và Quản trị công',
    'Trường Đại học Công Thương TP.HCM',
    'Trường Đại học Tài chính - Marketing',
    'Trường Đại học Ngoại ngữ - Tin học TP.HCM',
    'Trường Đại học Kiến trúc TP.HCM',
    'Trường Đại học Hùng Vương TP.HCM',
    'Học viện Hàng không Việt Nam',
    'Trường Đại học FPT (Cơ sở Hà Nội)',
    'Trường Đại học FPT (Cơ sở TP.HCM)',
  ];

  requiredOptions.forEach(option => assert.ok(institutions.includes(option), option));
  [
    'Đại học FPT',
    'Đại học HUTECH',
    'Đại học UEF',
    'Đại học Bách khoa - ĐHQG TP.HCM',
    'Đại học Ngân hàng TP. Hồ Chí Minh',
    'Đại học Công nghiệp TP. Hồ Chí Minh',
  ].forEach(alias => {
    assert.ok(!institutions.includes(alias), alias);
  });
});
