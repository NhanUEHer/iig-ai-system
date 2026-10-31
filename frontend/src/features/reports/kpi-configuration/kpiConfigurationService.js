import api from '../../../services/api';

const data = request => request.then(response => response.data.data);

export const listKpiConfig = team => data(api.get('/reports/kpi-config', { params: { team } }));
export const createKpiConfig = payload => data(api.post('/reports/kpi-config', payload));
export const updateKpiConfig = (id, payload) => data(api.put(`/reports/kpi-config/${id}`, payload));
export const reorderKpiConfig = (teamCode, ids) => data(api.put('/reports/kpi-config/order', { teamCode, ids }));
export const listDetailRows = team => data(api.get('/reports/detail-row-config', { params: { team } }));
export const createDetailRow = payload => data(api.post('/reports/detail-row-config', payload));
export const updateDetailRow = (id, payload) => data(api.put(`/reports/detail-row-config/${id}`, payload));
export const reorderDetailRows = (teamCode, sectionKey, ids) => data(api.put('/reports/detail-row-config/order', { teamCode, sectionKey, ids }));
export const getReportMasterData = () => data(api.get('/reports/bootstrap')).then(result => result.masterData || {});
