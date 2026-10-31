const numberOrNull=value=>value===null||value===undefined||value===''?null:Number(value);
const sum=(rows,key)=>rows.reduce((total,row)=>total+(numberOrNull(row[key])||0),0);
const ratio=(value,base)=>base?value/base:null;
const change=(value,base)=>base?(value-base)/Math.abs(base):null;
const formatRevenue=value=>{
  const amount=numberOrNull(value)||0,absolute=Math.abs(amount);
  if(absolute>=1e9)return`${(amount/1e9).toLocaleString('vi-VN',{maximumFractionDigits:2})} tỷ`;
  if(absolute>=1e6)return`${(amount/1e6).toLocaleString('vi-VN',{maximumFractionDigits:1})} triệu`;
  return`${amount.toLocaleString('vi-VN')} đ`;
};

function aggregateGroups(rows=[]) {
  const groups=new Map();
  for(const row of rows){
    const name=String(row.product_group||'Khác').trim()||'Khác';
    if(!groups.has(name))groups.set(name,{name,revenue:0,target:0,previousRevenue:0,orders:0});
    const item=groups.get(name);
    item.revenue+=numberOrNull(row.revenue)||0;
    item.target+=numberOrNull(row.monthly_target)||0;
    item.previousRevenue+=numberOrNull(row.previous_revenue)||0;
    item.orders+=numberOrNull(row.order_count)||0;
  }
  const total=[...groups.values()].reduce((value,item)=>value+item.revenue,0);
  return [...groups.values()].map(item=>({...item,share:ratio(item.revenue,total),completion:ratio(item.revenue,item.target),change:change(item.revenue,item.previousRevenue)})).sort((a,b)=>b.revenue-a.revenue);
}

function productStatus(product) {
  if(product.revenue<=0)return{code:'no_sales',label:'Không phát sinh',tone:'muted'};
  if(product.target>0&&product.completion<.85)return{code:'below_plan',label:'Dưới kế hoạch',tone:'danger'};
  if(product.completion>=1&&product.change!==null&&product.change<0)return{code:'above_plan_declining',label:'Vượt KH · đang giảm',tone:'warning'};
  if(product.change!==null&&product.change<=-.1)return{code:'declining',label:'Suy giảm mạnh',tone:'danger'};
  if(product.completion>=1&&product.change!==null&&product.change>=0)return{code:'growth',label:'Tăng trưởng tốt',tone:'success'};
  if(product.completion>=1)return{code:'above_plan',label:'Vượt kế hoạch',tone:'success'};
  return{code:'watch',label:'Cần theo dõi',tone:'warning'};
}

function buildProductInsights(products=[],limit=4) {
  const below=products.filter(item=>item.target>0&&item.completion<1).sort((a,b)=>a.completion-b.completion)[0];
  const declining=products.filter(item=>item.change!==null&&item.change<0).sort((a,b)=>a.change-b.change)[0];
  const growing=products.filter(item=>item.change!==null&&item.change>0).sort((a,b)=>b.change-a.change)[0];
  const noSales=products.filter(item=>item.revenue<=0);
  const concentration=products[0]?.share>=.5?products[0]:null;
  return [
    below&&{type:'below_plan',tone:'danger',title:`${below.name} chỉ đạt`,detail:`Đạt ${formatRevenue(below.revenue)} trên kế hoạch ${formatRevenue(below.target)}.`,value:below.completion},
    declining&&{type:'declining',tone:'danger',title:`${declining.name} giảm so với kỳ trước`,detail:`Doanh thu hiện tại ${formatRevenue(declining.revenue)}.`,value:declining.change},
    growing&&{type:'growing',tone:'success',title:`${growing.name} tăng trưởng tốt nhất`,detail:`Đóng góp ${formatRevenue(growing.revenue)} vào doanh thu.`,value:growing.change},
    noSales.length&&{type:'no_sales',tone:'danger',title:`${noSales.length} sản phẩm không phát sinh doanh thu`,detail:`Cần kiểm tra kế hoạch bán và nguyên nhân không có đơn.`,value:null},
    concentration&&{type:'concentration',tone:'warning',title:`Doanh thu phụ thuộc ${concentration.name}`,detail:`Sản phẩm này chiếm ${(concentration.share*100).toLocaleString('vi-VN',{maximumFractionDigits:1})}% tổng doanh thu.`,value:concentration.share}
  ].filter(Boolean).slice(0,limit);
}

function buildWaterfallSteps(products=[],revenue=0,previousRevenue=0,limit=5) {
  const byProduct=new Map();
  for(const product of products){
    const name=String(product.name||'Khác').trim()||'Khác';
    byProduct.set(name,(byProduct.get(name)||0)+product.revenue-product.previousRevenue);
  }
  const ranked=[...byProduct].map(([name,value])=>({name,value})).filter(item=>Math.abs(item.value)>0.000001).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
  const selected=ranked.slice(0,limit),other=ranked.slice(limit).reduce((total,item)=>total+item.value,0);
  const reconciliation=revenue-(previousRevenue+ranked.reduce((total,item)=>total+item.value,0));
  const otherValue=other+reconciliation;
  selected.sort((a,b)=>(b.value>=0)-(a.value>=0)||Math.abs(b.value)-Math.abs(a.value));
  if(Math.abs(otherValue)>0.000001)selected.push({name:'Khác',value:otherValue});
  return selected;
}

function buildRevenueDashboard({dashboard,monthly=[]}) {
  const rows=dashboard?.details||[],kpis=dashboard?.kpis||[];
  const kpi=code=>kpis.find(item=>item.code===code)||{};
  const revenue=sum(rows,'revenue')||(numberOrNull(kpi('DT_01').actual_value)||0);
  const target=sum(rows,'monthly_target')||(numberOrNull(kpi('DT_01').target_value)||0);
  const previousRevenue=sum(rows,'previous_revenue')||(numberOrNull(kpi('DT_01').previous_value)||0);
  const priorYearRevenue=sum(rows,'prior_year_revenue')||(numberOrNull(kpi('DT_01').prior_year_value)||0);
  const orders=sum(rows,'order_count')||(numberOrNull(kpi('DT_03').actual_value)||0);
  const previousOrders=numberOrNull(kpi('DT_03').previous_value);
  const averageOrder=orders?revenue/orders:numberOrNull(kpi('DT_04').actual_value);
  const previousAverageOrder=numberOrNull(kpi('DT_04').previous_value);
  const products=rows.map(row=>{
    const actual=numberOrNull(row.revenue)||0,plan=numberOrNull(row.monthly_target)||0,previous=numberOrNull(row.previous_revenue)||0,priorYear=numberOrNull(row.prior_year_revenue)||0,orders=numberOrNull(row.order_count)||0;
    const product={id:row.id||row.row_key,name:row.product_name||'—',group:row.product_group||'Khác',revenue:actual,target:plan,targetGap:actual-plan,previousRevenue:previous,priorYearRevenue:priorYear,orders,averageOrder:ratio(actual,orders),share:ratio(actual,revenue),completion:ratio(actual,plan),change:change(actual,previous),priorYearChange:change(actual,priorYear)};
    return{...product,status:productStatus(product)};
  }).sort((a,b)=>b.revenue-a.revenue);
  const groups=aggregateGroups(rows);
  const waterfallSteps=buildWaterfallSteps(products,revenue,previousRevenue);
  return {
    period:dashboard.period,
    metrics:{
      revenue:{value:revenue,previous:previousRevenue,change:change(revenue,previousRevenue)},
      completion:{value:ratio(revenue,target),target,gap:revenue-target},
      orders:{value:orders,previous:previousOrders,change:change(orders,previousOrders)},
      averageOrder:{value:averageOrder,previous:previousAverageOrder,change:change(averageOrder,previousAverageOrder)},
      growth:{month:change(revenue,previousRevenue),priorYear:change(revenue,priorYearRevenue)}
    },
    monthly:monthly.map(item=>({year:Number(item.year),month:Number(item.month),revenue:numberOrNull(item.actual),target:numberOrNull(item.target),completion:ratio(numberOrNull(item.actual),numberOrNull(item.target))})),
    groups,
    waterfall:{start:previousRevenue,steps:waterfallSteps,end:revenue},
    products,
    topProducts:products.slice(0,5),
    insights:buildProductInsights(products),
    businessSummary:{
      leadingProduct:products[0]||null,
      decliningCount:products.filter(item=>item.change!==null&&item.change<0).length,
      belowPlanCount:products.filter(item=>item.target>0&&item.completion<1).length,
      noSalesCount:products.filter(item=>item.revenue<=0).length
    },
    source:{detailRows:rows.length,kpis:kpis.map(item=>item.code)}
  };
}

module.exports={aggregateGroups,buildProductInsights,buildRevenueDashboard,buildWaterfallSteps,productStatus};
