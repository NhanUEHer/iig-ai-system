const test=require('node:test');
const assert=require('node:assert/strict');

test('Vietnamese report number parser uses comma only for decimals',async()=>{
  const {parseVietnameseNumber}=await import('../frontend/src/features/reports/utils/vietnameseNumber.js');
  assert.equal(parseVietnameseNumber('0,317'),'0.317');
  assert.equal(parseVietnameseNumber('12,5'),'12.5');
  assert.equal(parseVietnameseNumber('1.234.567,89'),'1234567.89');
  assert.equal(parseVietnameseNumber('1.000'),'1000');
});

test('report number parser accepts either common locale separators',async()=>{
  const {parseVietnameseNumber}=await import('../frontend/src/features/reports/utils/vietnameseNumber.js');
  assert.equal(parseVietnameseNumber('7,100,000,000'),'7100000000');
  assert.equal(parseVietnameseNumber('1,234,567.89'),'1234567.89');
  for(const value of ['1,2,3','1.234,56.7','.123']) assert.equal(parseVietnameseNumber(value),null,value);
  assert.equal(parseVietnameseNumber('0,',{allowIncomplete:true}),undefined);
  assert.equal(parseVietnameseNumber('1.',{allowIncomplete:true}),undefined);
});
