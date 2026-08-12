const numberOrNull=value=>value===null||value===undefined||value===''?null:Number(value);
const normalize=value=>String(value||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]+/g,'');
const rate=(actual,base)=>actual===null||base===null||Number(base)===0?null:(actual-base)/base;

function enrichKpiHistory(kpis=[],history=[]) {
  const values=new Map(history.map(row=>[`${row.source_period}|${String(row.team_code||'').toUpperCase()}|${String(row.code||'').toUpperCase()}`,numberOrNull(row.actual_value)]));
  return kpis.map(row=>{
    const team=String(row.team_code||'').toUpperCase(),code=String(row.code||'').toUpperCase();
    const previousKey=`previous|${team}|${code}`,priorKey=`prior_year|${team}|${code}`;
    const previous=values.has(previousKey)?values.get(previousKey):numberOrNull(row.previous_value);
    const prior=values.has(priorKey)?values.get(priorKey):numberOrNull(row.prior_year_value);
    const actual=numberOrNull(row.actual_value);
    return {...row,previous_value:previous,prior_year_value:prior,vs_previous:rate(actual,previous),previous_change:rate(actual,previous),prior_year_change:rate(actual,prior)};
  });
}

function enrichSocialHistory(rows=[],history=[],enabled=['followers_previous','reach_previous']) {
  const byCode=new Map(),byName=new Map();
  for(const item of history){if(item.channel_code)byCode.set(normalize(item.channel_code),item);if(item.channel_name)byName.set(normalize(item.channel_name),item);}
  return rows.map(row=>{
    const previous=row.channel_code&&byCode.has(normalize(row.channel_code))?byCode.get(normalize(row.channel_code)):byName.get(normalize(row.channel_name));
    return {...row,
      followers_previous:enabled.includes('followers_previous')?(previous?numberOrNull(previous.followers_current):numberOrNull(row.followers_previous)):numberOrNull(row.followers_previous),
      reach_previous:enabled.includes('reach_previous')?(previous?numberOrNull(previous.reach_current):numberOrNull(row.reach_previous)):numberOrNull(row.reach_previous)
    };
  });
}

function applyComKpiFallback(kpis=[],details=[]) {
  const sumIfPresent=field=>{
    const values=details.map(row=>numberOrNull(row[field])).filter(value=>value!==null&&Number.isFinite(value));
    return values.length?values.reduce((sum,value)=>sum+value,0):null;
  };
  const fallback={TT_01:sumIfPresent('followers_previous'),TT_03:sumIfPresent('reach_previous')};
  return kpis.map(row=>row.previous_value===null||row.previous_value===undefined
    ?{...row,previous_value:fallback[String(row.code||'').toUpperCase()]??null}
    :row);
}

module.exports={enrichKpiHistory,enrichSocialHistory,applyComKpiFallback,rate};
