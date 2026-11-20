import api from './api';

const data = response => response.data.data;
export const listFolders = () => api.get('/content-studio/folders').then(data);
export const getFolderSummary = () => api.get('/content-studio/folders/summary').then(data);
export const createFolder = body => api.post('/content-studio/folders', body).then(data);
export const updateFolder = (id, body) => api.patch(`/content-studio/folders/${id}`, body).then(data);
export const deleteFolder = id => api.delete(`/content-studio/folders/${id}`).then(data);

export const detectText = text => api.post('/content-studio/detect', { text }).then(data);
export const detectDocx = file => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/content-studio/detect/docx', form).then(data);
};

export const uploadImage = file => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/content-studio/images', form).then(data);
};

export const listItems = params => api.get('/content-studio/items', { params }).then(data);
export const getRecentItems = params => api.get('/content-studio/items/recent', { params }).then(data);
export const getAttention = () => api.get('/content-studio/attention').then(data);
export const getItem = id => api.get(`/content-studio/items/${id}`).then(data);
export const createItem = body => api.post('/content-studio/items', body).then(data);
export const updateItem = (id, body) => api.patch(`/content-studio/items/${id}`, body).then(data);
export const deleteItem = id => api.delete(`/content-studio/items/${id}`).then(data);

export const errorMessage = (error, fallback) => error?.response?.data?.error || error?.response?.data?.message || fallback;

export async function exportItem(id, kind, format) {
  const response = await api.get(`/content-studio/items/${id}/export/${kind}/${format}`, { responseType: 'blob' });
  const name = /filename="?([^"]+)"?/.exec(response.headers['content-disposition'] || '')?.[1] || `${kind}.${format}`;
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name, skipped: Number(response.headers['x-export-skipped'] || 0) };
}
export const regenerateStale = id => api.post(`/content-studio/items/${id}/regenerate-stale`).then(data);
export const generateItem = (id, tasks) => api.post(`/content-studio/items/${id}/generate`, tasks ? { tasks } : {}).then(data);
export const regenerateArtifact = id => api.post(`/content-studio/artifacts/${id}/regenerate`).then(data);
export const fillVocabItem = (id, index) => api.post(`/content-studio/artifacts/${id}/vocab/fill`, { index }).then(data);
export const regenerateTranslationSentence = (id, index) => api.post(`/content-studio/artifacts/${id}/translation/sentence`, { index }).then(data);
export const saveArtifact = (id, content) => api.put(`/content-studio/artifacts/${id}`, { content }).then(data);
export const updateItemContent = (id, body) => api.put(`/content-studio/items/${id}/content`, body).then(data);

export const extractDictionary = id => api.post(`/content-studio/items/${id}/dictionary/extract`).then(data);
export const getDictionary = id => api.get(`/content-studio/items/${id}/dictionary`).then(data);
export const saveDictionaryList = (id, sentences) => api.put(`/content-studio/items/${id}/dictionary/list`, { sentences }).then(data);
export const generateDictionary = (id, selection = {}) => api.post(`/content-studio/items/${id}/dictionary/generate`, selection).then(data);
export const saveDictionaryEntry = (candidateId, content) => api.put(`/content-studio/dictionary/entries/${candidateId}`, { content }).then(data);
export const regenerateDictionaryEntry = candidateId => api.post(`/content-studio/dictionary/entries/${candidateId}/regenerate`).then(data);
export const deleteDictionaryCandidate = candidateId => api.delete(`/content-studio/dictionary/candidates/${candidateId}`).then(data);
