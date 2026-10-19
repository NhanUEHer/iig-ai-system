const {getSpecification}=require('./toeicMaterialSpecifications');

const CORE_POLICY=`QUY TẮC CHUNG:
1. Chỉ tạo nội dung mới dựa trên dạng bài và chủ đề; không chép hoặc tái dựng câu hỏi được nhớ lại.
2. Không khẳng định nội dung là đề thi thật và không biến dữ liệu ngoài brief thành fact.
3. Tuân thủ chính xác JSON schema. Không thêm markdown ngoài JSON.
4. Mọi đáp án phải giải được từ dữ kiện; giải thích phải chỉ ra vì sao đáp án đúng.
5. Giữ nguyên ngôn ngữ chuyên môn TOEIC; dùng ngôn ngữ hướng dẫn trong brief.`;

function templateCode(item){return `${String(item.skill||'MULTI').toLowerCase()}_${item.materialType.toLowerCase()}_v2`;}
function buildPrompt({blueprint,item,trends,batch,repairIssues=[],previousContent=null}){
  const spec=getSpecification(item),code=templateCode(item);
  const brief={blueprint,item:{...item,quantity:batch.quantity},batch,verifiedTrends:trends,...(previousContent?{contentToRepair:previousContent}:{})};
  const repair=repairIssues.length?`\nCHỈ SỬA CÁC LỖI SAU, giữ nguyên nội dung hợp lệ:\n${JSON.stringify(repairIssues)}`:'';
  return {code,version:'material-v2',spec,prompt:`Bạn là chuyên gia phát triển học liệu TOEIC của IIG. Template: ${code}.
${CORE_POLICY}

QUY CHUẨN LOẠI HỌC LIỆU:
${spec.instructions}

QUY CHUẨN KỸ NĂNG:
${spec.skillInstructions}

YÊU CẦU BATCH:
- Sinh đúng ${batch.quantity} ${spec.unit} cho batch ${batch.index}/${batch.total}.
- Phân bổ độ khó của batch: ${JSON.stringify(batch.difficulty)}.
- Mỗi question phải có trường difficulty là BASIC, INTERMEDIATE hoặc ADVANCED trong phần context theo mẫu "[DIFFICULTY:LEVEL]".
- qualityChecklist phải tự đối chiếu số lượng, target score, tính nguyên bản và trend đã bao phủ.${repair}

PRODUCTION BRIEF:
${JSON.stringify(brief)}`};
}

module.exports={CORE_POLICY,templateCode,buildPrompt};
