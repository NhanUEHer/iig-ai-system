const HttpError=require('../../http/httpError');
const repository=require('./materialBlueprintRepository');
const settingsService=require('./materialSettingService');

const TYPES=['STRATEGY_LESSON','SKILL_DRILL','ERROR_DRILL','VOCABULARY_PACK','MINI_TEST','FULL_MOCK_TEST','SAMPLE_ANSWER','SELF_REVIEW_RUBRIC'];
const LABELS={STRATEGY_LESSON:'Bài chiến lược',SKILL_DRILL:'Bài luyện từng dạng',ERROR_DRILL:'Bài luyện lỗi',VOCABULARY_PACK:'Bộ từ vựng',MINI_TEST:'Mini test',FULL_MOCK_TEST:'Đề thi thử',SAMPLE_ANSWER:'Bài mẫu',SELF_REVIEW_RUBRIC:'Rubric tự đánh giá'};
const PER_SKILL=new Set(['STRATEGY_LESSON','SKILL_DRILL','ERROR_DRILL','VOCABULARY_PACK','MINI_TEST','SAMPLE_ANSWER','SELF_REVIEW_RUBRIC']);
const clean=(value,max=2000)=>String(value||'').trim().slice(0,max);
const unique=value=>[...new Set(value)];
const allocate=(total,count,index)=>Math.floor(total/count)+(index<total%count?1:0);

function buildItems(trends,settings){
  const skills=unique(trends.map(item=>item.skill)).sort();const items=[];
  for(const type of settings.enabledMaterialTypes){
    const total=Number(settings.materialQuantities[type]||0);if(total<1)continue;
    const scopes=PER_SKILL.has(type)?skills:[null];
    scopes.forEach((skill,index)=>{
      const quantity=PER_SKILL.has(type)?allocate(total,scopes.length,index):total;if(quantity<1)return;
      const related=skill?trends.filter(item=>item.skill===skill):trends;
      const topics=unique(related.map(item=>item.topic||item.taskType).filter(Boolean)).slice(0,4);
      const groups=unique(related.map(item=>item.questionGroup).filter(Boolean));
      items.push({materialType:type,skill,questionGroup:groups.length===1?groups[0]:null,title:`${LABELS[type]}${skill?` · ${skill}`:''}`,objective:`Củng cố ${groups.join(', ')||skill||'toàn bài'} dựa trên xu hướng: ${topics.join('; ')||'các tín hiệu đã xác nhận'}.`,rationale:`Đề xuất từ ${related.length} cụm xu hướng đủ điều kiện.`,quantity,difficultyMix:settings.difficultyMix,sourceTrendIds:related.map(item=>item.id),generationConstraints:{instructionLanguage:settings.instructionLanguage,targetScore:skill==='LISTENING'||skill==='READING'?settings.targetScores.LISTENING_READING:skill?settings.targetScores.SPEAKING_WRITING:settings.targetScores,maximumSourceSimilarity:settings.maximumSourceSimilarity,mustCreateOriginalContent:true,mustCiteTrendEvidence:true}});
    });
  }
  return items;
}

function validateItems(items){
  if(!Array.isArray(items)||!items.length)throw new HttpError('Blueprint phải có ít nhất một hạng mục học liệu.',400,'BLUEPRINT_ITEMS_REQUIRED');
  return items.map(item=>{if(!TYPES.includes(item.materialType))throw new HttpError('Loại học liệu không hợp lệ.',400,'BLUEPRINT_ITEM_TYPE');const quantity=Math.round(Number(item.quantity));if(quantity<1||quantity>200)throw new HttpError('Số lượng mỗi hạng mục phải từ 1 đến 200.',400,'BLUEPRINT_ITEM_QUANTITY');const title=clean(item.title,240),objective=clean(item.objective);if(!title||!objective)throw new HttpError('Tên và mục tiêu hạng mục không được để trống.',400,'BLUEPRINT_ITEM_CONTENT');return {...item,title,objective,rationale:clean(item.rationale),quantity,difficultyMix:item.difficultyMix||{},sourceTrendIds:Array.isArray(item.sourceTrendIds)?item.sourceTrendIds:[],generationConstraints:item.generationConstraints||{}};});
}
function validateDifficulty(value){const mix={BASIC:Math.round(Number(value?.BASIC)),INTERMEDIATE:Math.round(Number(value?.INTERMEDIATE)),ADVANCED:Math.round(Number(value?.ADVANCED))};if(Object.values(mix).some(item=>!Number.isFinite(item)||item<0||item>100)||Object.values(mix).reduce((sum,item)=>sum+item,0)!==100)throw new HttpError('Phân bổ độ khó blueprint phải có tổng bằng 100%.',400,'BLUEPRINT_DIFFICULTY');return mix;}

function map(row){if(!row)return null;return {id:row.id,title:row.title,summary:row.summary,status:row.status,instructionLanguage:row.instruction_language,targetScores:row.target_scores,difficultyMix:row.difficulty_mix,settingsSnapshot:row.settings_snapshot,trendSnapshot:row.trend_snapshot,rejectionNote:row.rejection_note,approvedBy:row.approved_by,approvedAt:row.approved_at,createdAt:row.created_at,updatedAt:row.updated_at,itemCount:row.item_count,assetCount:row.asset_count,items:row.items?.map(item=>({id:item.id,position:item.position,materialType:item.material_type,skill:item.skill,questionGroup:item.question_group,title:item.title,objective:item.objective,rationale:item.rationale,quantity:item.quantity,difficultyMix:item.difficulty_mix,sourceTrendIds:item.source_trend_ids,generationConstraints:item.generation_constraints}))};}

async function generate(userId,input={}){
  const preview=await settingsService.preview(userId);const trends=preview.data.filter(item=>item.eligible);
  if(!trends.length)throw new HttpError('Chưa có xu hướng nào đủ điều kiện để tạo blueprint.',400,'BLUEPRINT_NO_ELIGIBLE_TRENDS');
  const settings=preview.settings,items=buildItems(trends,settings);if(!items.length)throw new HttpError('Cấu hình hiện tại chưa bật hạng mục học liệu nào.',400,'BLUEPRINT_NO_MATERIALS');
  const skills=unique(trends.map(item=>item.skill));const now=new Date();const data={title:clean(input.title,240)||`Bộ học liệu xu hướng ${skills.join(' · ')} – ${now.toLocaleDateString('vi-VN')}`,summary:clean(input.summary)||`Blueprint được tạo từ ${trends.length} cụm xu hướng đã vượt toàn bộ rule.`,status:settings.requireBlueprintApproval?'DRAFT':'APPROVED',instructionLanguage:settings.instructionLanguage,targetScores:settings.targetScores,difficultyMix:settings.difficultyMix,settingsSnapshot:settings,trendSnapshot:trends.map(item=>({id:item.id,skill:item.skill,questionGroup:item.questionGroup,taskType:item.taskType,topic:item.topic,trendType:item.trendType,sourceCount:item.sourceCount,confidence:item.confidence,lastSeenAt:item.lastSeenAt})),items};
  return map(await repository.create(userId,data));
}
async function list(userId){return {data:(await repository.list(userId)).map(map)};}
async function detail(userId,id){const result=map(await repository.detail(userId,id));if(!result)throw new HttpError('Không tìm thấy blueprint.',404,'BLUEPRINT_NOT_FOUND');return result;}
async function update(userId,id,input){const current=await detail(userId,id);const data={title:clean(input.title,240),summary:clean(input.summary),instructionLanguage:input.instructionLanguage,targetScores:input.targetScores||{},difficultyMix:validateDifficulty(input.difficultyMix),items:validateItems(input.items)};if(!data.title)throw new HttpError('Tên blueprint không được để trống.',400,'BLUEPRINT_TITLE_REQUIRED');if(!['VI','EN','BILINGUAL'].includes(data.instructionLanguage))throw new HttpError('Ngôn ngữ không hợp lệ.',400,'BLUEPRINT_LANGUAGE');const saved=await repository.update(userId,current.id,data);if(saved?.locked)throw new HttpError('Chỉ blueprint ở trạng thái Nháp mới được chỉnh sửa.',409,'BLUEPRINT_LOCKED');return map(saved);}
async function setStatus(userId,id,input){await detail(userId,id);const status=input.status;if(!['DRAFT','APPROVED','REJECTED'].includes(status))throw new HttpError('Trạng thái blueprint không hợp lệ.',400,'BLUEPRINT_STATUS');if(status==='REJECTED'&&!clean(input.note))throw new HttpError('Cần nhập lý do từ chối blueprint.',400,'BLUEPRINT_REJECTION_NOTE');return map(await repository.setStatus(userId,id,status,clean(input.note,2000)));}

module.exports={buildItems,validateItems,validateDifficulty,generate,list,detail,update,setStatus};
