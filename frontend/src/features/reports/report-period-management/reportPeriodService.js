import api from '../../../services/api';

const data = request => request.then(response => response.data.data);

export const listReportPeriods = filters => data(api.get('/reports/manual/periods', { params: filters }));
export const getReportPeriod = id => data(api.get(`/reports/manual/periods/${id}`));
export const createReportPeriod = payload => data(api.post('/reports/manual/periods', payload));
export const listReportAssignees = () => data(api.get('/reports/manual/assignees'));
export const updateReportAssignee = (periodId, teamCode, userId) => data(api.patch(`/reports/manual/periods/${periodId}/teams/${teamCode}/assignee`, { userId: userId || null }));
export const updateReportDeadline = (periodId, deadline) => data(api.patch(`/reports/manual/periods/${periodId}/deadline`, { deadline: deadline || null }));
export const transitionReportSubmission = (periodId, teamCode, action, note = '') => data(api.post(`/reports/manual/periods/${periodId}/teams/${teamCode}/workflow`, { action, note }));
export const publishReportPeriod = id => data(api.post(`/reports/manual/periods/${id}/publish`));
export const reopenReportPeriod = (id, reason) => data(api.post(`/reports/manual/periods/${id}/reopen`, { reason }));
export const deleteReportPeriod = id => data(api.delete(`/reports/manual/periods/${id}`));
