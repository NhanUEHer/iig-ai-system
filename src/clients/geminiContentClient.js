const axios = require('axios');
const HttpError = require('../http/httpError');
const {buildPrompt}=require('../modules/content-sources/materialPromptRegistry');

const model = process.env.GEMINI_INGEST_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const materialModel = process.env.GEMINI_MATERIAL_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash';

function parseJson(text) {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(clean); } catch { throw new HttpError('AI trả về dữ liệu không đúng định dạng.', 502, 'CONTENT_AI_INVALID_RESPONSE'); }
}

async function detectMedia({ buffer, mimeType, filename }) {
  if (!process.env.GEMINI_API_KEY) throw new HttpError('Chưa cấu hình GEMINI_API_KEY.', 503, 'GEMINI_NOT_CONFIGURED');
  const prompt = `Bạn là bộ trích xuất dữ liệu học liệu TOEIC. Hãy đọc chính xác file ${filename || ''}.
Trả về JSON thuần với các trường:
{"documentType":"exam_recall|lesson|question_set|score_report|social_post|other","language":"vi|en|mixed|other","title":"","rawText":"toàn bộ chữ nhìn thấy, giữ xuống dòng hợp lý","summary":"tóm tắt ngắn","toeicSkills":["LISTENING|READING|SPEAKING|WRITING"],"isExamRecall":false,"examDate":null,"questionSignals":[],"topics":[],"confidence":0.0,"warnings":[]}.
Không suy đoán chữ không nhìn thấy. Nếu là ảnh chụp bài đăng, bỏ thành phần giao diện không liên quan nhưng giữ nội dung bài và bình luận có giá trị.`;
  let response;
  try {
    response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: buffer.toString('base64') } }, { text: prompt }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } },
      { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' }, timeout: 120000 }
    );
  } catch (error) {
    const detail = error.response?.data?.error?.message;
    throw new HttpError(detail || 'Không thể đọc nội dung bằng Gemini.', 502, 'CONTENT_AI_FAILED');
  }
  const text = response.data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  return { detected: parseJson(text), usage: response.data?.usageMetadata || {}, model };
}

const analysisSchema={type:'OBJECT',properties:{
  classification:{type:'OBJECT',properties:{contentType:{type:'STRING',enum:['POST_EXAM_RECALL','LESSON','QUESTION_SET','SCORE_REPORT','OTHER']},exam:{type:'STRING'},skills:{type:'ARRAY',items:{type:'STRING',enum:['LISTENING','READING','SPEAKING','WRITING']}},isRelevant:{type:'BOOLEAN'},relevanceScore:{type:'NUMBER'},evidence:{type:'STRING'}},required:['contentType','exam','skills','isRelevant','relevanceScore','evidence']},
  examContext:{type:'OBJECT',properties:{examDate:{type:'STRING',nullable:true},examSession:{type:'STRING',nullable:true},location:{type:'STRING',nullable:true},actualScores:{type:'ARRAY',items:{type:'OBJECT',properties:{skill:{type:'STRING'},score:{type:'NUMBER'},evidence:{type:'STRING'}},required:['skill','score','evidence']}},evidence:{type:'STRING'}},required:['examDate','examSession','location','actualScores','evidence']},
  recalledItems:{type:'ARRAY',items:{type:'OBJECT',properties:{skill:{type:'STRING'},questionNumbers:{type:'STRING'},taskType:{type:'STRING'},topic:{type:'STRING'},promptRecall:{type:'STRING'},candidateResponse:{type:'STRING'},confidence:{type:'NUMBER'},evidence:{type:'STRING'}},required:['skill','questionNumbers','taskType','topic','promptRecall','candidateResponse','confidence','evidence']}},
  performanceSignals:{type:'ARRAY',items:{type:'OBJECT',properties:{skill:{type:'STRING'},category:{type:'STRING'},finding:{type:'STRING'},severity:{type:'STRING',enum:['LOW','MEDIUM','HIGH']},confidence:{type:'NUMBER'},evidence:{type:'STRING'}},required:['skill','category','finding','severity','confidence','evidence']}},
  trendSignals:{type:'ARRAY',items:{type:'OBJECT',properties:{signalType:{type:'STRING'},finding:{type:'STRING'},verificationStatus:{type:'STRING',enum:['UNVERIFIED','PARTIALLY_VERIFIED','VERIFIED']},confidence:{type:'NUMBER'},evidence:{type:'STRING'}},required:['signalType','finding','verificationStatus','confidence','evidence']}},
  insights:{type:'ARRAY',items:{type:'OBJECT',properties:{type:{type:'STRING'},finding:{type:'STRING'},implication:{type:'STRING'},confidence:{type:'NUMBER'},evidence:{type:'ARRAY',items:{type:'STRING'}}},required:['type','finding','implication','confidence','evidence']}},
  materialRecommendations:{type:'ARRAY',items:{type:'OBJECT',properties:{title:{type:'STRING'},skill:{type:'STRING'},priority:{type:'STRING',enum:['LOW','MEDIUM','HIGH']},reason:{type:'STRING'},suggestedAssets:{type:'ARRAY',items:{type:'STRING'}},evidence:{type:'ARRAY',items:{type:'STRING'}}},required:['title','skill','priority','reason','suggestedAssets','evidence']}},
  uncertainties:{type:'ARRAY',items:{type:'STRING'}}
},required:['classification','examContext','recalledItems','performanceSignals','trendSignals','insights','materialRecommendations','uncertainties']};

async function analyzeText(sourceText){
  if(!process.env.GEMINI_API_KEY)throw new HttpError('Chưa cấu hình GEMINI_API_KEY.',503,'GEMINI_NOT_CONFIGURED');
  const prompt=`Phân tích nguồn dưới đây để phục vụ nghiên cứu đề thi và phát triển học liệu TOEIC.
QUY TẮC BẮT BUỘC:
1. Chỉ ghi FACT khi có bằng chứng nguyên văn trong nguồn. Mỗi evidence phải là một đoạn trích ngắn chép đúng từ nguồn.
2. Không tự tạo ngày thi, câu hỏi, điểm số, địa điểm hay xu hướng. Không biết thì trả null hoặc bỏ mục.
3. Một nguồn đơn lẻ chỉ tạo trendSignal UNVERIFIED. VERIFIED chỉ được dùng khi ngay trong nguồn có bằng chứng từ nhiều nguồn độc lập.
4. Phân biệt nội dung đề được nhớ lại với câu trả lời của thí sinh và feedback của người bình luận.
5. Confidence phản ánh độ rõ của bằng chứng, không phản ánh mức độ tự tin chủ quan.
6. Insight và đề xuất học liệu phải dẫn lại ít nhất một evidence có thật.
7. Giữ nguyên ngôn ngữ chuyên môn TOEIC; trả phần mô tả bằng tiếng Việt.

NGUỒN:
---BEGIN SOURCE---
${sourceText}
---END SOURCE---`;
  let response;
  try{response=await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema:analysisSchema,temperature:0.05}},{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'Content-Type':'application/json'},timeout:120000});}
  catch(error){const detail=error.response?.data?.error?.message;throw new HttpError(detail||'Gemini không thể phân tích nguồn.',502,'CONTENT_ANALYSIS_FAILED');}
  const text=response.data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';
  return {analysis:parseJson(text),usage:response.data?.usageMetadata||{},model};
}

const generatedMaterialSchema={type:'OBJECT',properties:{
  title:{type:'STRING'},overview:{type:'STRING'},learningObjectives:{type:'ARRAY',items:{type:'STRING'}},teacherNotes:{type:'ARRAY',items:{type:'STRING'}},
  sections:{type:'ARRAY',items:{type:'OBJECT',properties:{title:{type:'STRING'},instructions:{type:'STRING'},content:{type:'STRING'},questions:{type:'ARRAY',items:{type:'OBJECT',properties:{prompt:{type:'STRING'},context:{type:'STRING'},difficulty:{type:'STRING',enum:['BASIC','INTERMEDIATE','ADVANCED']},options:{type:'ARRAY',items:{type:'STRING'}},correctAnswer:{type:'STRING'},explanation:{type:'STRING'},sampleAnswer:{type:'STRING'},rubric:{type:'ARRAY',items:{type:'STRING'}}},required:['prompt','context','difficulty','options','correctAnswer','explanation','sampleAnswer','rubric']}},vocabulary:{type:'ARRAY',items:{type:'OBJECT',properties:{term:{type:'STRING'},partOfSpeech:{type:'STRING'},meaningVi:{type:'STRING'},meaningEn:{type:'STRING'},example:{type:'STRING'},collocations:{type:'ARRAY',items:{type:'STRING'}}},required:['term','partOfSpeech','meaningVi','meaningEn','example','collocations']}}},required:['title','instructions','content','questions','vocabulary']}},
  qualityChecklist:{type:'OBJECT',properties:{targetScoreAlignment:{type:'STRING'},originalityNotes:{type:'STRING'},trendCoverage:{type:'ARRAY',items:{type:'STRING'}},answerKeyComplete:{type:'BOOLEAN'}},required:['targetScoreAlignment','originalityNotes','trendCoverage','answerKeyComplete']}
},required:['title','overview','learningObjectives','teacherNotes','sections','qualityChecklist']};
const materialReviewSchema={type:'OBJECT',properties:{decision:{type:'STRING',enum:['PASS','NEEDS_REPAIR']},issues:{type:'ARRAY',items:{type:'OBJECT',properties:{code:{type:'STRING'},severity:{type:'STRING',enum:['LOW','MEDIUM','HIGH']},location:{type:'STRING'},message:{type:'STRING'}},required:['code','severity','location','message']}},summary:{type:'STRING'}},required:['decision','issues','summary']};

async function generateLearningMaterial({blueprint,item,trends,batch,repairIssues=[],previousContent=null}){
  if(!process.env.GEMINI_API_KEY)throw new HttpError('Chưa cấu hình GEMINI_API_KEY.',503,'GEMINI_NOT_CONFIGURED');
  const normalizedBlueprint={title:blueprint.title,summary:blueprint.summary,instructionLanguage:blueprint.instructionLanguage,targetScores:blueprint.targetScores,difficultyMix:blueprint.difficultyMix};
  const normalizedItem={materialType:item.materialType,skill:item.skill,questionGroup:item.questionGroup,title:item.title,objective:item.objective,quantity:item.quantity,difficultyMix:item.difficultyMix,generationConstraints:item.generationConstraints};
  const template=buildPrompt({blueprint:normalizedBlueprint,item:normalizedItem,trends,batch,repairIssues,previousContent});
  let response;
  try{response=await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(materialModel)}:generateContent`,{contents:[{parts:[{text:template.prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema:generatedMaterialSchema,temperature:.25,maxOutputTokens:8192}},{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'Content-Type':'application/json'},timeout:120000});}
  catch(error){const detail=error.response?.data?.error?.message;throw new HttpError(detail||'Gemini không thể sinh học liệu.',502,'MATERIAL_GENERATION_FAILED');}
  const text=response.data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';
  return {content:parseJson(text),usage:response.data?.usageMetadata||{},model:materialModel,promptVersion:template.version,templateCode:template.code};
}

async function reviewLearningMaterial({item,batch,content}){
  if(!process.env.GEMINI_API_KEY)throw new HttpError('Chưa cấu hình GEMINI_API_KEY.',503,'GEMINI_NOT_CONFIGURED');
  const prompt=`Bạn là reviewer học thuật TOEIC độc lập. Không viết lại học liệu. Chỉ đánh giá: đúng dạng bài, một đáp án tốt nhất, distractor hợp lý, độ khó phù hợp, sample/rubric khớp yêu cầu và nội dung tự nhiên. Chỉ trả NEEDS_REPAIR khi có lỗi HIGH ảnh hưởng khả năng sử dụng.\nBRIEF:\n${JSON.stringify({item,batch})}\nCONTENT:\n${JSON.stringify(content)}`;
  let response;try{response=await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(materialModel)}:generateContent`,{contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:'application/json',responseSchema:materialReviewSchema,temperature:.05,maxOutputTokens:2048}},{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY,'Content-Type':'application/json'},timeout:120000});}
  catch(error){const detail=error.response?.data?.error?.message;throw new HttpError(detail||'Gemini không thể kiểm định học liệu.',502,'MATERIAL_REVIEW_FAILED');}
  const text=response.data?.candidates?.[0]?.content?.parts?.map(part=>part.text||'').join('')||'';return {review:parseJson(text),usage:response.data?.usageMetadata||{},model:materialModel};
}

module.exports = { detectMedia, analyzeText, generateLearningMaterial, reviewLearningMaterial, generatedMaterialSchema, materialReviewSchema };
