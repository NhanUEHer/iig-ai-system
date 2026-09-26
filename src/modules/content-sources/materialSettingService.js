const HttpError=require('../../http/httpError');
const repository=require('./materialSettingRepository');
const trendRepository=require('./trendRepository');

const SKILLS=['LISTENING','READING','SPEAKING','WRITING'];
const PROGRAMS=['TOEIC_LR','TOEIC_SW'];
const MATERIAL_TYPES=['STRATEGY_LESSON','SKILL_DRILL','ERROR_DRILL','VOCABULARY_PACK','MINI_TEST','FULL_MOCK_TEST','SAMPLE_ANSWER','SELF_REVIEW_RUBRIC'];
const PRIORITIES=['REPEATED_PROMPT','RECURRING_TASK_TOPIC','COMMON_ERROR','CONTENT_GAP'];
const DEFAULTS={examPrograms:PROGRAMS,enabledSkills:SKILLS,targetScores:{LISTENING_READING:'450-850',SPEAKING_WRITING:'120-160'},instructionLanguage:'BILINGUAL',minimumSources:2,minimumConfidence:.75,trendWindowDays:30,enabledMaterialTypes:MATERIAL_TYPES,materialQuantities:{STRATEGY_LESSON:1,SKILL_DRILL:10,ERROR_DRILL:10,VOCABULARY_PACK:20,MINI_TEST:2,FULL_MOCK_TEST:1,SAMPLE_ANSWER:3,SELF_REVIEW_RUBRIC:1},difficultyMix:{BASIC:30,INTERMEDIATE:50,ADVANCED:20},prioritySignals:PRIORITIES,maximumSourceSimilarity:.65,requireBlueprintApproval:true};
const array=(value,allowed,fallback)=>{const items=Array.isArray(value)?[...new Set(value.filter(item=>allowed.includes(item)))]:fallback;return items.length?items:fallback;};
function validate(input={}){
  const settings={...DEFAULTS,...input};settings.examPrograms=array(settings.examPrograms,PROGRAMS,DEFAULTS.examPrograms);settings.enabledSkills=array(settings.enabledSkills,SKILLS,DEFAULTS.enabledSkills);settings.enabledMaterialTypes=array(settings.enabledMaterialTypes,MATERIAL_TYPES,DEFAULTS.enabledMaterialTypes);settings.prioritySignals=array(settings.prioritySignals,PRIORITIES,DEFAULTS.prioritySignals);
  settings.minimumSources=Math.round(Number(settings.minimumSources));if(settings.minimumSources<1||settings.minimumSources>20)throw new HttpError('Số nguồn tối thiểu phải từ 1 đến 20.',400,'MATERIAL_SETTING_MIN_SOURCES');
  settings.minimumConfidence=Number(settings.minimumConfidence);if(settings.minimumConfidence<0||settings.minimumConfidence>1)throw new HttpError('Độ tin cậy phải nằm trong khoảng 0–100%.',400,'MATERIAL_SETTING_CONFIDENCE');
  settings.trendWindowDays=Math.round(Number(settings.trendWindowDays));if(settings.trendWindowDays<7||settings.trendWindowDays>365)throw new HttpError('Khoảng thời gian xu hướng phải từ 7 đến 365 ngày.',400,'MATERIAL_SETTING_WINDOW');
  settings.maximumSourceSimilarity=Number(settings.maximumSourceSimilarity);if(settings.maximumSourceSimilarity<.3||settings.maximumSourceSimilarity>.9)throw new HttpError('Độ giống tối đa với nguồn phải từ 30–90%.',400,'MATERIAL_SETTING_SIMILARITY');
  if(!['VI','EN','BILINGUAL'].includes(settings.instructionLanguage))throw new HttpError('Ngôn ngữ hướng dẫn không hợp lệ.',400,'MATERIAL_SETTING_LANGUAGE');
  settings.targetScores={...DEFAULTS.targetScores,...(settings.targetScores||{})};settings.requireBlueprintApproval=settings.requireBlueprintApproval!==false;
  settings.materialQuantities={};for(const type of MATERIAL_TYPES){const value=Math.round(Number(input.materialQuantities?.[type]??DEFAULTS.materialQuantities[type]));if(value<0||value>100)throw new HttpError(`Số lượng ${type} phải từ 0 đến 100.`,400,'MATERIAL_SETTING_QUANTITY');settings.materialQuantities[type]=value;}
  settings.difficultyMix={BASIC:Math.round(Number(input.difficultyMix?.BASIC??30)),INTERMEDIATE:Math.round(Number(input.difficultyMix?.INTERMEDIATE??50)),ADVANCED:Math.round(Number(input.difficultyMix?.ADVANCED??20))};if(Object.values(settings.difficultyMix).some(value=>value<0||value>100)||Object.values(settings.difficultyMix).reduce((sum,value)=>sum+value,0)!==100)throw new HttpError('Phân bổ độ khó phải có tổng bằng 100%.',400,'MATERIAL_SETTING_DIFFICULTY');
  return settings;
}
function map(row){if(!row)return DEFAULTS;return {id:row.id,examPrograms:row.exam_programs,enabledSkills:row.enabled_skills,targetScores:row.target_scores,instructionLanguage:row.instruction_language,minimumSources:row.minimum_sources,minimumConfidence:Number(row.minimum_confidence),trendWindowDays:row.trend_window_days,enabledMaterialTypes:row.enabled_material_types,materialQuantities:row.material_quantities,difficultyMix:row.difficulty_mix,prioritySignals:row.priority_signals,maximumSourceSimilarity:Number(row.maximum_source_similarity),requireBlueprintApproval:row.require_blueprint_approval,updatedAt:row.updated_at};}
async function get(userId){return map(await repository.find(userId));}
async function save(userId,input){return map(await repository.save(userId,validate(input)));}
function evaluateTrend(trend,settings,now=new Date()){
  const reasons=[];if(!settings.enabledSkills.includes(trend.skill))reasons.push('Kỹ năng đang tắt');if(trend.sourceCount<settings.minimumSources)reasons.push(`Chưa đủ ${settings.minimumSources} nguồn`);if(trend.confidence<settings.minimumConfidence)reasons.push('Độ tin cậy dưới ngưỡng');
  if(trend.lastSeenAt){const age=(now-new Date(trend.lastSeenAt))/(86400000);if(age>settings.trendWindowDays)reasons.push('Ngoài khoảng thời gian xu hướng');}
  if(!settings.prioritySignals.includes(trend.trendType))reasons.push('Loại tín hiệu không được ưu tiên');
  const eligible=!reasons.length;const priority=!eligible?'NONE':trend.trendType==='REPEATED_PROMPT'&&trend.sourceCount>=3?'HIGH':trend.trendType==='REPEATED_PROMPT'?'MEDIUM':'LOW';
  return {...trend,eligible,priority,exclusionReasons:reasons,recommendedMaterials:eligible?settings.enabledMaterialTypes.filter(type=>settings.materialQuantities[type]>0).map(type=>({type,quantity:settings.materialQuantities[type]})):[]};
}
async function preview(userId){const settings=await get(userId),trends=await trendRepository.list(userId,{}),selected=trends.data.filter(item=>item.isSelected),evaluated=selected.map(item=>evaluateTrend(item,settings));return {settings,data:evaluated,meta:{total:evaluated.length,selected:selected.length,eligible:evaluated.filter(item=>item.eligible).length,excluded:evaluated.filter(item=>!item.eligible).length}};}
module.exports={DEFAULTS,validate,evaluateTrend,get,save,preview};
