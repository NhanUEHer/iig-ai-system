import api from './api';

export const extractDictionaryItems = passage => api.post('/dictionary/extract', { passage }, { timeout: 120000 }).then(response => response.data.data);
export const saveDictionaryCandidates = data => api.post('/dictionary', data).then(response => response.data.data);
export const generateDictionaryCandidates = (id, candidateIds) => api.post(`/dictionary/history/${id}/generate`, { candidateIds }).then(response => response.data.data);
export const getDictionaryHistory = params => api.get('/dictionary/history', { params }).then(response => response.data);
export const getDictionaryDetail = id => api.get(`/dictionary/history/${id}`).then(response => response.data.data);
export const exportDictionary = id => api.get(`/dictionary/history/${id}/export`,{responseType:'blob'}).then(response=>{
  const url=URL.createObjectURL(response.data),link=document.createElement('a');
  link.href=url;link.download=`VocabularyDictionary_${id.slice(0,8)}.xlsx`;link.click();URL.revokeObjectURL(url);
});
export const exportDictionaryDocument = (id,format) => api.get(`/dictionary/history/${id}/export/${format}`,{responseType:'blob'}).then(response=>{
  const match=(response.headers['content-disposition']||'').match(/filename="?([^";]+)"?/i),url=URL.createObjectURL(response.data),link=document.createElement('a');
  link.href=url;link.download=match?.[1]||`VocabularyDictionary_${id.slice(0,8)}.${format}`;link.click();URL.revokeObjectURL(url);
});
