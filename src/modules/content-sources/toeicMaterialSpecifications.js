const TYPE_SPECS={
  STRATEGY_LESSON:{unit:'sections',batchSize:1,requiresQuestions:false,instructions:'Giải thích chiến lược theo từng bước, ví dụ ngắn, lỗi thường gặp và checklist áp dụng.'},
  SKILL_DRILL:{unit:'questions',batchSize:5,requiresQuestions:true,instructions:'Mỗi câu phải luyện đúng một mục tiêu, có độ khó, đáp án và giải thích rõ distractor.'},
  ERROR_DRILL:{unit:'questions',batchSize:5,requiresQuestions:true,instructions:'Tập trung vào lỗi phổ biến; mỗi câu phải nêu lỗi, cách sửa và nguyên tắc tránh lặp lại.'},
  VOCABULARY_PACK:{unit:'vocabulary',batchSize:10,requiresQuestions:false,instructions:'Mỗi mục gồm từ loại, nghĩa Việt/Anh, ví dụ tự nhiên và collocation phù hợp bối cảnh TOEIC.'},
  MINI_TEST:{unit:'questions',batchSize:5,requiresQuestions:true,deepReview:true,instructions:'Mô phỏng đúng dạng bài, cân bằng đáp án và distractor; không gắn nhãn là đề thi thật.'},
  FULL_MOCK_TEST:{unit:'assets',batchSize:1,requiresQuestions:true,deepReview:true,instructions:'Tạo một phần đề độc lập theo blueprint; cấu trúc lớn phải được chia theo TOEIC Part, không cố sinh toàn bộ đề trong một response.'},
  SAMPLE_ANSWER:{unit:'questions',batchSize:3,requiresQuestions:true,instructions:'Mỗi đề có sample answer phù hợp target score, phân tích điểm mạnh và rubric chấm.'},
  SELF_REVIEW_RUBRIC:{unit:'sections',batchSize:1,requiresQuestions:false,instructions:'Tạo rubric quan sát được, mô tả rõ từng mức và checklist tự sửa.'}
};

const SKILL_SPECS={
  LISTENING:'Ngữ liệu nghe phải tự nhiên, có bối cảnh công việc/đời sống; câu hỏi và distractor không phụ thuộc kiến thức ngoài audio script.',
  READING:'Đoạn đọc phải đủ dữ kiện để có một đáp án tốt nhất; kiểm tra ngữ pháp, từ vựng và logic tham chiếu.',
  SPEAKING:'Phải có thời gian chuẩn bị/trả lời khi phù hợp, sample answer và rubric về phát âm, lưu loát, ngữ pháp, từ vựng và mức độ hoàn thành yêu cầu.',
  WRITING:'Phải có yêu cầu rõ, sample answer và rubric về task fulfillment, organization, grammar và vocabulary.'
};

function getSpecification(item){
  const type=TYPE_SPECS[item.materialType];
  if(!type)throw new Error(`Unsupported material type: ${item.materialType}`);
  return {...type,skillInstructions:SKILL_SPECS[item.skill]||'Bảo đảm tính nhất quán giữa các kỹ năng và đúng mục tiêu blueprint.'};
}

module.exports={TYPE_SPECS,SKILL_SPECS,getSpecification};
