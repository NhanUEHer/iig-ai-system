import api from './api';
const unwrap = request => request.then(response => response.data);
export const listScoreScales = params => unwrap(api.get('/score-scales', { params })).then(response => response.data);
export const getScoreScale = id => unwrap(api.get(`/score-scales/${id}`)).then(response => response.data);
export const createScoreScale = data => unwrap(api.post('/score-scales', data)).then(response => response.data);
export const updateScoreScale = (id, data) => unwrap(api.put(`/score-scales/${id}`, data)).then(response => response.data);
export const updateScoreScaleStatus = (id, status) => unwrap(api.patch(`/score-scales/${id}/status`, { status })).then(response => response.data);
export const deleteScoreScale = id => unwrap(api.delete(`/score-scales/${id}`));
