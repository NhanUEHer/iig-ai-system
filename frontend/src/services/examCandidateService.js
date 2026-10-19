import api from './api';
const unwrap=response=>response.data;
export const listExamCandidates=params=>api.get('/exam-candidates',{params}).then(unwrap);
export const getExamCandidateFilterOptions=()=>api.get('/exam-candidates/filter-options').then(response=>response.data.data);
export const exportExamCandidates=params=>api.get('/exam-candidates/export',{params,responseType:'blob'}).then(response=>response.data);
