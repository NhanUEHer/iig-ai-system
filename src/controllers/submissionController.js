// Backward-compatible facade for integrations that still import the former
// all-in-one submission controller. New routes import the focused controllers.
const syncController = require('./syncController');
const mappingController = require('./mappingController');
const coreController = require('./coreSubmissionController');
const scoringController = require('./scoringController');
const exportController = require('./exportController');

module.exports = {
  syncMappings: syncController.syncMappings,
  syncSubmission: syncController.syncSubmission,
  listSubmissions: coreController.list,
  getSubmissionDetail: coreController.detail,
  getFileUrl: coreController.fileUrl,
  deleteSubmission: coreController.remove,
  bulkDeleteSubmissions: coreController.bulkRemove,
  listMappings: mappingController.list,
  saveMapping: mappingController.save,
  deleteMapping: mappingController.remove,
  gradeAnswerWithAI: scoringController.gradeAnswer,
  transcribeAnswerWithAI: scoringController.transcribeAnswer,
  cleanAnswerAudio: scoringController.cleanAudio,
  saveTeacherNote: scoringController.teacherNote,
  exportSubmissionsExcel: exportController.exportSubmissions
};
