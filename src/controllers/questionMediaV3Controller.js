const service = require('../modules/question-bank-v3/mediaService');

const uploadStagedMedia = async (req, res) => res.status(201).json({ success: true, data: await service.uploadStagedMedia(req.params.questionId, req.params.mediaType, req.file, req.auth?.userId) });
const uploadContentMedia = async (req, res) => res.status(201).json({ success: true, data: await service.uploadContentMedia(req.params.contentId, req.params.mediaType, req.file, req.auth?.userId) });
const removeContentMedia = async (req, res) => res.json({ success: true, data: await service.removeContentMedia(req.params.contentId, req.params.mediaType) });
const uploadSubQuestionAudio = async (req, res) => res.status(201).json({ success: true, data: await service.uploadSubQuestionAudio(req.params.subQuestionId, req.file, req.auth?.userId) });
const removeSubQuestionAudio = async (req, res) => res.json({ success: true, data: await service.removeSubQuestionAudio(req.params.subQuestionId) });
const url = async (req, res) => res.json({ success: true, data: { url: await service.url(req.params.mediaId) } });

module.exports = { uploadStagedMedia, uploadContentMedia, removeContentMedia, uploadSubQuestionAudio, removeSubQuestionAudio, url };
