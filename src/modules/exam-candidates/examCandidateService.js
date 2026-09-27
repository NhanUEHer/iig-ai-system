const repository=require('./examCandidateRepository');
const TOEIC_LABELS={NEVER_STUDIED:'Chưa học',STUDIED_NOT_TESTED:'Đã học nhưng chưa thi',TOOK_TOEIC:'Đã thi TOEIC',OTHER_CERTIFICATE:'Đã học/thi chứng chỉ khác'};
const STATUS_LABELS={REGISTERED:'Chưa thi',IN_PROGRESS:'Đang làm bài',SUBMITTED:'Đã nộp bài',EXPIRED:'Hết giờ',CANCELLED:'Đã hủy'};
const list=filters=>repository.list(filters);
const filterOptions=async()=>({...await repository.filterOptions(),toeicExperiences:Object.entries(TOEIC_LABELS).map(([value,label])=>({value,label})),attemptStatuses:Object.entries(STATUS_LABELS).map(([value,label])=>({value,label}))});
module.exports={list,filterOptions,TOEIC_LABELS,STATUS_LABELS};
