import api from '../../../services/api';

const data = response => response.data.data;
const prefix = '/ai-core';

export const listProviders = () => api.get(`${prefix}/providers`).then(data);
export const listConnections = () => api.get(`${prefix}/connections`).then(data);
export const createConnection = body => api.post(`${prefix}/connections`, body).then(data);
export const updateConnection = (id, body) => api.patch(`${prefix}/connections/${id}`, body).then(data);
export const checkConnection = id => api.post(`${prefix}/connections/${id}/check`).then(data);

export const listModels = () => api.get(`${prefix}/models`).then(data);
export const saveModels = items => api.put(`${prefix}/models`, { items }).then(data);
export const syncModels = () => api.post(`${prefix}/models/sync`).then(data);

export const listLogs = params => api.get(`${prefix}/logs`, { params }).then(data);
export const getLog = id => api.get(`${prefix}/logs/${id}`).then(data);
export const exportLogs = params => api.get(`${prefix}/logs/export`, { params, responseType: 'blob' });
export const getUsage = params => api.get(`${prefix}/usage`, { params }).then(data);

export const listAgents = () => api.get(`${prefix}/agents`).then(data);
export const getAgent = key => api.get(`${prefix}/agents/${key}`).then(data);
export const createAgent = body => api.post(`${prefix}/agents`, body).then(data);
export const updateAgent = (key, body) => api.patch(`${prefix}/agents/${key}`, body).then(data);
export const saveAgentDraft = (key, body) => api.put(`${prefix}/agents/${key}/draft`, body).then(data);
export const testAgent = (key, variables, images) => api.post(`${prefix}/agents/${key}/test`, images?.length ? { variables, images } : { variables }).then(data);
export const publishAgent = key => api.post(`${prefix}/agents/${key}/publish`).then(data);
export const listAgentVersions = key => api.get(`${prefix}/agents/${key}/versions`).then(data);
export const diffAgentVersions = (key, a, b) => api.get(`${prefix}/agents/${key}/versions/${a}/diff/${b}`).then(data);
export const restoreAgentVersion = (key, version) => api.post(`${prefix}/agents/${key}/versions/${version}/restore`).then(data);
export const runAgent = (key, variables, ref) => api.post(`${prefix}/agents/${key}/run`, { variables, ...(ref ? { ref } : {}) }).then(data);

export const errorMessage = (error, fallback) => error?.response?.data?.error?.message
  || error?.response?.data?.error || error?.response?.data?.message || fallback;
