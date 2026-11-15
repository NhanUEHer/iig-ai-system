import api from './api';

const data = response => response.data.data;
export const listFolders = () => api.get('/content-studio/folders').then(data);
export const createFolder = body => api.post('/content-studio/folders', body).then(data);
export const updateFolder = (id, body) => api.patch(`/content-studio/folders/${id}`, body).then(data);
export const deleteFolder = id => api.delete(`/content-studio/folders/${id}`).then(data);

export const detectText = text => api.post('/content-studio/detect', { text }).then(data);
export const detectDocx = file => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/content-studio/detect/docx', form).then(data);
};

export const listItems = params => api.get('/content-studio/items', { params }).then(data);
export const getItem = id => api.get(`/content-studio/items/${id}`).then(data);
export const createItem = body => api.post('/content-studio/items', body).then(data);
export const updateItem = (id, body) => api.patch(`/content-studio/items/${id}`, body).then(data);
export const deleteItem = id => api.delete(`/content-studio/items/${id}`).then(data);

export const errorMessage = (error, fallback) => error?.response?.data?.error || error?.response?.data?.message || fallback;
