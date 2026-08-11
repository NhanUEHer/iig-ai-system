const test=require('node:test');
const assert=require('node:assert/strict');
const {enrichRevenueDetails}=require('../src/modules/reports/reportRevenueMetrics');

test('revenue detail calculates share, target completion and previous change',()=>{
  const rows=[
    {product_code:'SP_01',product_group:'Tự sản xuất',product_name:'TOEIC LR',revenue:120,monthly_target:100},
    {product_code:'SP_02',product_group:'Đối tác',product_name:'Voucher',revenue:80,monthly_target:100}
  ];
  const history=[
    {source_period:'previous',product_code:'SP_01',product_group:'Khác',product_name:'Tên cũ',revenue:100},
    {source_period:'previous',product_code:null,product_group:'Đối tác',product_name:' Voucher ',revenue:40}
  ];
  const result=enrichRevenueDetails(rows,history);
  assert.equal(result[0].revenue_share,0.6);
  assert.equal(result[0].achievement_rate,1.2);
  assert.equal(result[0].previous_revenue,100);
  assert.equal(result[0].previous_change,0.2);
  assert.equal(result[1].previous_revenue,40);
  assert.equal(result[1].previous_change,1);
});

test('missing revenue history stays null instead of becoming a false zero',()=>{
  const [row]=enrichRevenueDetails([{product_code:'NEW',product_group:'Khác',product_name:'Mới',revenue:10,monthly_target:0}],[]);
  assert.equal(row.achievement_rate,null);
  assert.equal(row.previous_revenue,null);
  assert.equal(row.previous_change,null);
  assert.equal(row.prior_year_revenue,null);
  assert.equal(row.prior_year_change,null);
});
