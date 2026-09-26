import api from './api';

export async function listQuestions(params = {}) {
  const response = await api.get('/question-bank/questions', { params });
  return response.data;
}
export async function getQuestionFilterOptions(params = {}) {
  const response = await api.get('/question-bank/questions/filter-options', { params });
  return response.data;
}

export async function deleteQuestion(id) {
  const response = await api.delete(`/question-bank/questions/${id}`);
  return response.data;
}
export async function listQuestionGroups() {
  const response = await api.get('/question-bank/groups');
  return response.data;
}
export async function listManagedQuestionGroups(params = {}) {
  const response = await api.get('/question-bank/question-groups', { params });
  return response.data;
}
export async function previewManagedQuestionGroupCode() {
  const response = await api.get('/question-bank/question-groups/next-code');
  return response.data;
}
export async function createManagedQuestionGroup(payload) {
  const response = await api.post('/question-bank/question-groups', payload);
  return response.data;
}
export async function updateManagedQuestionGroup(id, payload) {
  const response = await api.put(`/question-bank/question-groups/${id}`, payload);
  return response.data;
}
export async function deleteManagedQuestionGroup(id) {
  const response = await api.delete(`/question-bank/question-groups/${id}`);
  return response.data;
}
export async function listQuestionTags() {
  const response = await api.get('/question-bank/tags');
  return response.data;
}
export async function createQuestionTag(name) {
  const response = await api.post('/question-bank/tags', { name });
  return response.data;
}
export async function createQuestion(payload) {
  const response = await api.post('/question-bank/questions', payload);
  return response.data;
}
export async function getQuestion(id) { const response = await api.get(`/question-bank/questions/${id}`); return response.data; }
export async function updateQuestion(id, payload) { const response = await api.put(`/question-bank/questions/${id}`, payload); return response.data; }
export async function listQuestionContents(id) { const response = await api.get(`/question-bank/questions/${id}/contents`); return response.data; }
export async function createQuestionContent(id, payload) { const response = await api.post(`/question-bank/questions/${id}/contents`, payload); return response.data; }
export async function updateQuestionContent(questionId, contentId, payload) { const response = await api.put(`/question-bank/questions/${questionId}/contents/${contentId}`, payload); return response.data; }
export async function deleteQuestionContent(questionId, contentId) { const response = await api.delete(`/question-bank/questions/${questionId}/contents/${contentId}`); return response.data; }
export async function listContentMedia(contentId) { const response = await api.get(`/question-bank/contents/${contentId}/media`); return response.data; }
export async function deleteQuestionMedia(mediaId) { const response = await api.delete(`/question-bank/media/${mediaId}`); return response.data; }
export async function listSubQuestions(id) { const response = await api.get(`/question-bank/questions/${id}/sub-questions`); return response.data; }
export async function createSubQuestion(id, payload) { const response = await api.post(`/question-bank/questions/${id}/sub-questions`, payload); return response.data; }
export async function updateSubQuestion(questionId, subQuestionId, payload) { const response = await api.put(`/question-bank/questions/${questionId}/sub-questions/${subQuestionId}`, payload); return response.data; }
export async function deleteSubQuestion(questionId, subQuestionId) { const response = await api.delete(`/question-bank/questions/${questionId}/sub-questions/${subQuestionId}`); return response.data; }
export async function listSubQuestionMedia(subQuestionId) { const response = await api.get(`/question-bank/sub-questions/${subQuestionId}/media`); return response.data; }
export async function listSampleAnswerMedia(sampleAnswerId) { const response = await api.get(`/question-bank/sample-answers/${sampleAnswerId}/media`); return response.data; }
