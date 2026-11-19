import api from './api';

const root = '/secure-lectures';
const unwrap = response => response.data?.data;

export function secureLectureError(error, fallback = 'Không thể hoàn tất thao tác.') {
  return error?.response?.data?.error?.message || error?.message || fallback;
}

export const listSecureLectureFolders = () => api.get(`${root}/folders`).then(unwrap);
export const createSecureLectureFolder = input => api.post(`${root}/folders`, input).then(unwrap);
export const updateSecureLectureFolder = (id, input) => api.patch(`${root}/folders/${id}`, input).then(unwrap);
export const deleteSecureLectureFolder = id => api.delete(`${root}/folders/${id}`).then(unwrap);
export const getSecureLectureOverview = params => api.get(`${root}/overview`, { params }).then(unwrap);
export const listSecureLectures = params => api.get(`${root}/lectures`, { params }).then(unwrap);
export const createSecureLecture = (input, onUploadProgress) => {
  const form = new FormData();
  form.append('file', input.file);
  form.append('title', input.title);
  if (input.folderId) form.append('folderId', input.folderId);
  if (input.note) form.append('note', input.note);
  return api.post(`${root}/lectures`, form, { onUploadProgress }).then(unwrap);
};
export const getSecureLecture = id => api.get(`${root}/lectures/${id}`).then(unwrap);
export const updateSecureLecture = (id, input) => api.patch(`${root}/lectures/${id}`, input).then(unwrap);
export const moveSecureLectures = (lectureIds, folderId) => api.post(`${root}/lectures/move`, { lectureIds, folderId }).then(unwrap);
export const archiveSecureLecture = id => api.delete(`${root}/lectures/${id}`).then(unwrap);
export const listSecureLectureVersions = id => api.get(`${root}/lectures/${id}/versions`).then(unwrap);
export const createSecureLectureVersion = (id, { file, note, makeCurrent = true }, onUploadProgress) => {
  const form = new FormData();
  form.append('file', file);
  if (note) form.append('note', note);
  form.append('makeCurrent', String(makeCurrent));
  return api.post(`${root}/lectures/${id}/versions`, form, { onUploadProgress }).then(unwrap);
};
export const setSecureLectureCurrentVersion = (id, versionId) => api.post(`${root}/lectures/${id}/versions/${versionId}/current`).then(unwrap);
export const previewSecureLectureVersionUrl = (id, versionId) => `/api${root}/lectures/${id}/versions/${versionId}/preview`;
export const getSecureLectureVersionPreview = (id, versionId) => api.get(`${root}/lectures/${id}/versions/${versionId}/preview`, { responseType: 'blob' }).then(response => response.data);
export const listSecureLectureShares = id => api.get(`${root}/lectures/${id}/shares`).then(unwrap);
export const createSecureLectureShare = (id, input) => api.post(`${root}/lectures/${id}/shares`, input).then(unwrap);
export const updateSecureLectureShare = (id, input) => api.patch(`${root}/shares/${id}`, input).then(unwrap);
export const revokeSecureLectureShare = (id, reason) => api.post(`${root}/shares/${id}/revoke`, { reason }).then(unwrap);
export const listSecureLectureShareDevices = id => api.get(`${root}/shares/${id}/devices`).then(unwrap);
export const removeSecureLectureDevice = (shareId, deviceRef) => api.post(`${root}/shares/${shareId}/devices/${deviceRef}/remove`).then(unwrap);
export const blockSecureLectureDevice = (shareId, deviceRef) => api.post(`${root}/shares/${shareId}/devices/${deviceRef}/block`).then(unwrap);
export const unblockSecureLectureDevice = (shareId, deviceRef) => api.post(`${root}/shares/${shareId}/devices/${deviceRef}/unblock`).then(unwrap);
export const kickSecureLectureSession = id => api.post(`${root}/sessions/${id}/kick`).then(unwrap);
export const listSecureLectureLogs = params => api.get(`${root}/logs`, { params }).then(unwrap);
