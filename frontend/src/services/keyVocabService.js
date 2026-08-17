import api from './api';

export const generateKeyVocab = passage => api.post('/key-vocab/generate', { passage }, { timeout: 120000 }).then(response => response.data.data);
export const saveKeyVocab = data => api.post('/key-vocab', data).then(response => response.data.data);
export const getKeyVocabHistory = params => api.get('/key-vocab/history', { params }).then(response => response.data);
export const getKeyVocabDetail = id => api.get(`/key-vocab/history/${id}`).then(response => response.data.data);

function download(response, fallbackName) {
  const match = (response.headers['content-disposition'] || '').match(/filename="?([^";]+)"?/i);
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = match?.[1] || fallbackName; anchor.click();
  URL.revokeObjectURL(url);
}

export const exportKeyVocabPreview = vocabularies => api.post('/key-vocab/export', { vocabularies }, { responseType: 'blob' }).then(response => download(response, 'KeyVocabulary_Import.xlsx'));
export const exportKeyVocabHistory = id => api.get(`/key-vocab/history/${id}/export`, { responseType: 'blob' }).then(response => download(response, `KeyVocabulary_${id.slice(0, 8)}.xlsx`));
