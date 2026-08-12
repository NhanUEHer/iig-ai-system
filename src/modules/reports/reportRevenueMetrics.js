const numberOrNull=value=>value===null||value===undefined||value===''?null:Number(value);
const normalize=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
const codeKey=row=>normalize(row?.product_code);
const nameKey=row=>`${normalize(row?.product_group)}|${normalize(row?.product_name)}`;
const change=(actual,base)=>actual===null||base===null||Number(base)===0?null:(actual-base)/base;

function historyMap(rows=[],sourcePeriod) {
  const byCode=new Map(),byName=new Map();
  rows.filter(row=>row.source_period===sourcePeriod).forEach(row=>{
    const value=numberOrNull(row.revenue);
    if(codeKey(row))byCode.set(codeKey(row),value);
    byName.set(nameKey(row),value);
  });
  return {byCode,byName};
}

function historicalValue(maps,row) {
  const code=codeKey(row);
  if(code&&maps.byCode.has(code))return maps.byCode.get(code);
  return maps.byName.has(nameKey(row))?maps.byName.get(nameKey(row)):null;
}

function enrichRevenueDetails(details=[],history=[]) {
  const previous=historyMap(history,'previous'),prior=historyMap(history,'prior_year');
  const total=details.reduce((sum,row)=>sum+(numberOrNull(row.revenue)||0),0);
  return details.map(row=>{
    const revenue=numberOrNull(row.revenue),target=numberOrNull(row.monthly_target);
    const historyPrevious=historicalValue(previous,row),historyPrior=historicalValue(prior,row);
    const previousRevenue=historyPrevious===null?numberOrNull(row.previous_revenue):historyPrevious;
    const priorYearRevenue=historyPrior===null?numberOrNull(row.prior_year_revenue):historyPrior;
    return {...row,
      previous_revenue:previousRevenue,prior_year_revenue:priorYearRevenue,
      revenue_share:total&&revenue!==null?revenue/total:null,
      achievement_rate:target&&revenue!==null?revenue/target:null,
      previous_change:change(revenue,previousRevenue),prior_year_change:change(revenue,priorYearRevenue)
    };
  });
}

module.exports={enrichRevenueDetails,historyMap,historicalValue};
