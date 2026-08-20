import api from './api';

export const getLearningMaterialHistory=params=>api.get('/learning-materials/history',{params}).then(response=>({data:response.data.data||[],meta:response.data.meta}));

