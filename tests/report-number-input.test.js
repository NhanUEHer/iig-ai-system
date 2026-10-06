const test=require('node:test');
const assert=require('node:assert/strict');

test('Vietnamese report number parser uses comma only for decimals',async()=>{
  const {parseVietnameseNumber}=await import('../frontend/src/features/reports/utils/vietnameseNumber.js');
  assert.equal(parseVietnameseNumber('0,317'),'0.317');
  assert.equal(parseVietnameseNumber('12,5'),'12.5');
  assert.equal(parseVietnameseNumber('1.234.567,89'),'1234567.89');
  assert.equal(parseVietnameseNumber('1.000'),'1000');
});

test('Vietnamese report number parser rejects malformed separators',async()=>{
  const {parseVietnameseNumber}=await import('../frontend/src/features/reports/utils/vietnameseNumber.js');
  for(const value of ['1.00','1.0000','1,2,3','1.234,56.7','1,000.25','.123','1.'])
    assert.equal(parseVietnameseNumber(value),null,value);
  assert.equal(parseVietnameseNumber('0,',{allowIncomplete:true}),undefined);
  assert.equal(parseVietnameseNumber('1.',{allowIncomplete:true}),undefined);
});
