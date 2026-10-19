const {getSpecification}=require('./toeicMaterialSpecifications');

const allQuestions=content=>(content.sections||[]).flatMap(section=>section.questions||[]);
const allVocabulary=content=>(content.sections||[]).flatMap(section=>section.vocabulary||[]);
function validateGeneratedContent(content,item,expectedQuantity,expectedDifficulty=null){
  const spec=getSpecification(item),issues=[];
  if(!content||!Array.isArray(content.sections)||!content.sections.length)issues.push({code:'MISSING_SECTIONS',severity:'HIGH',message:'Học liệu chưa có section.'});
  const questions=allQuestions(content||{}),vocabulary=allVocabulary(content||{});
  const actual=spec.unit==='questions'?questions.length:spec.unit==='vocabulary'?vocabulary.length:spec.unit==='sections'?(content?.sections||[]).length:expectedQuantity;
  if(spec.unit!=='assets'&&actual!==expectedQuantity)issues.push({code:'QUANTITY_MISMATCH',severity:'HIGH',expected:expectedQuantity,actual,message:`Cần đúng ${expectedQuantity} ${spec.unit}, hiện có ${actual}.`});
  questions.forEach((question,index)=>{
    if(!String(question.prompt||'').trim())issues.push({code:'MISSING_PROMPT',severity:'HIGH',questionIndex:index});
    if(!String(question.correctAnswer||'').trim())issues.push({code:'MISSING_ANSWER',severity:'HIGH',questionIndex:index});
    if(!String(question.explanation||'').trim())issues.push({code:'MISSING_EXPLANATION',severity:'MEDIUM',questionIndex:index});
    if(['SPEAKING','WRITING'].includes(item.skill)&&(!String(question.sampleAnswer||'').trim()||!question.rubric?.length))issues.push({code:'MISSING_SAMPLE_OR_RUBRIC',severity:'HIGH',questionIndex:index});
    if(question.options?.length&& !question.options.some(option=>String(option).trim()===String(question.correctAnswer).trim())&&!/^[A-D]$/i.test(String(question.correctAnswer).trim()))issues.push({code:'ANSWER_NOT_IN_OPTIONS',severity:'HIGH',questionIndex:index});
  });
  const duplicatePrompts=questions.map(q=>String(q.prompt||'').trim().toLowerCase()).filter((value,index,array)=>value&&array.indexOf(value)!==index);
  if(duplicatePrompts.length)issues.push({code:'DUPLICATE_QUESTIONS',severity:'MEDIUM',count:new Set(duplicatePrompts).size});
  if(questions.length&&expectedDifficulty){const actualDifficulty={BASIC:0,INTERMEDIATE:0,ADVANCED:0};questions.forEach(question=>{if(actualDifficulty[question.difficulty]!==undefined)actualDifficulty[question.difficulty]++;});for(const level of Object.keys(actualDifficulty))if(actualDifficulty[level]!==Number(expectedDifficulty[level]||0))issues.push({code:'DIFFICULTY_MISMATCH',severity:'HIGH',level,expected:Number(expectedDifficulty[level]||0),actual:actualDifficulty[level]});}
  return {valid:!issues.some(issue=>issue.severity==='HIGH'),expectedQuantity,actualQuantity:actual,questionCount:questions.length,vocabularyCount:vocabulary.length,issues};
}
module.exports={validateGeneratedContent,allQuestions,allVocabulary};
