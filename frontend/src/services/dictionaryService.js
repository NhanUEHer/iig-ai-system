import api from './api';

export const extractDictionaryItems = passage => api.post('/dictionary/extract', { passage }, { timeout: 120000 }).then(response => response.data.data);
export const saveDictionaryCandidates = data => api.post('/dictionary', data).then(response => response.data.data);
export const generateDictionaryCandidates = (id, candidateIds) => api.post(`/dictionary/history/${id}/generate`, { candidateIds }).then(response => response.data.data);
export const getDictionaryHistory = params => api.get('/dictionary/history', { params }).then(response => response.data);
export const getDictionaryDetail = id => api.get(`/dictionary/history/${id}`).then(response => response.data.data);
