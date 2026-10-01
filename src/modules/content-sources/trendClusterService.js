const crypto=require('crypto');
const repository=require('./trendRepository');
const HttpError=require('../../http/httpError');

const STOP=new Set(['the','a','an','is','are','of','to','and','or','in','on','at','for','with','this','that','what','why','how','do','does','should','would','could','của','và','là','có','về','cho','một','những','các','được','hỏi']);
const clean=value=>String(value||'').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const tokens=value=>new Set(clean(value).split(/\s+/).filter(word=>word.length>1&&!STOP.has(word)));
const jaccard=(a,b)=>{const left=tokens(a),right=tokens(b);if(!left.size&&!right.size)return 0;let common=0;for(const word of left)if(right.has(word))common++;return common/(left.size+right.size-common||1);};
const same=(a,b)=>clean(a)===clean(b)&&clean(a)!=='';
function similarity(a,b){
  if(clean(a.skill)!==clean(b.skill)||clean(a.questionNumbers)!==clean(b.questionNumbers))return 0;
  const task=same(a.taskType,b.taskType)?1:jaccard(a.taskType,b.taskType);
  const topic=jaccard(a.topic,b.topic);
  const prompt=jaccard(a.promptRecall,b.promptRecall);
  return Number((.35*task+.25*topic+.40*prompt).toFixed(4));
}
function flatten(rows){return rows.flatMap(row=>(row.analysis?.recalledItems||[]).map(item=>({...item,sourceId:row.source_id,analysisId:row.id,examDate:row.analysis?.examContext?.examDate||null}))).filter(item=>item.skill&&item.questionNumbers&&item.evidence);}
function cluster(rows){
  const items=flatten(rows),parent=items.map((_,index)=>index);const root=index=>parent[index]===index?index:(parent[index]=root(parent[index]));const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent[b]=a;};
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(items[i].sourceId!==items[j].sourceId&&similarity(items[i],items[j])>=.55)join(i,j);
  const groups=new Map();items.forEach((item,index)=>{const key=root(index);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
  return [...groups.values()].map(group=>summarize(group));
}
function summarize(group){
  const sources=[...new Set(group.map(item=>item.sourceId))];let scores=[];for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++)if(group[i].sourceId!==group[j].sourceId)scores.push(similarity(group[i],group[j]));
  const average=scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:0;const sourceCount=sources.length;
  const trendType=sourceCount<2?'SINGLE_SIGNAL':average>=.8?'REPEATED_PROMPT':'RECURRING_TASK_TOPIC';const status=sourceCount>=2?'CONFIRMED':'UNVERIFIED';
  const dates=group.map(item=>item.examDate).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  const canonical=group.slice().sort((a,b)=>(b.confidence||0)-(a.confidence||0))[0];
  const key=crypto.createHash('sha256').update([clean(canonical.skill),clean(canonical.questionNumbers),clean(canonical.taskType),clean(canonical.topic)].join('|')).digest('hex');
  return {clusterKey:key,skill:canonical.skill,questionGroup:canonical.questionNumbers,taskType:canonical.taskType||'',topic:canonical.topic||'',trendType,verificationStatus:status,sourceCount,averageSimilarity:Number(average.toFixed(4)),confidence:Number(Math.min(.99,(sourceCount<2?.45:.65)+Math.min(.2,(sourceCount-2)*.05)+average*.15).toFixed(4)),firstSeenAt:dates[0]||null,lastSeenAt:dates.at(-1)||null,members:group.map(item=>({...item,itemHash:crypto.createHash('sha256').update(JSON.stringify([item.skill,item.questionNumbers,item.evidence])).digest('hex')}))};
}
async function rebuild(userId,input={}){const supplied=input?.sourceIds;if(supplied!==undefined&&!Array.isArray(supplied))throw new HttpError('sourceIds phải là một danh sách.',400,'TREND_SOURCE_IDS_INVALID');const sourceIds=supplied===undefined?null:[...new Set(supplied.map(String))];if(sourceIds&&(!sourceIds.length||sourceIds.length>100||sourceIds.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))))throw new HttpError('Danh sách nguồn không hợp lệ.',400,'TREND_SOURCE_IDS_INVALID');const rows=await repository.approvedAnalyses(userId,sourceIds);if(sourceIds&&rows.length!==sourceIds.length)throw new HttpError('Một số nguồn không tồn tại, chưa được xác nhận hoặc không thuộc tài khoản.',400,'TREND_SOURCE_NOT_ELIGIBLE');const trends=cluster(rows);await repository.replaceForUser(userId,trends);return {data:trends,meta:{scope:sourceIds?'SELECTED':'ALL_APPROVED',approvedAnalyses:rows.length,selectedSourceIds:sourceIds||rows.map(row=>row.source_id),total:trends.length,confirmed:trends.filter(item=>item.verificationStatus==='CONFIRMED').length}};}
async function select(userId,input={}){if(!Array.isArray(input.trendIds))throw new HttpError('trendIds phải là một danh sách.',400,'TREND_SELECTION_INVALID');const trendIds=[...new Set(input.trendIds.map(String))];if(!trendIds.length||trendIds.length>100||trendIds.some(id=>!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))throw new HttpError('Phải chọn ít nhất một xu hướng hợp lệ.',400,'TREND_SELECTION_INVALID');const saved=await repository.saveSelection(userId,trendIds);if(!saved)throw new HttpError('Có xu hướng không tồn tại, chưa đủ điều kiện hoặc không thuộc tài khoản.',400,'TREND_SELECTION_NOT_ELIGIBLE');return {trendIds:saved,count:saved.length};}
module.exports={clean,jaccard,similarity,cluster,rebuild,select,list:(userId,query)=>repository.list(userId,query)};
