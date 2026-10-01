const storage=require('../../services/storageService');
async function getSignedMediaUrl(key){return key?storage.getSignedUrl(key):null;}
async function uploadEventMedia(eventId,kind,file){const extension=file.mimetype==='image/png'?'png':file.mimetype==='image/webp'?'webp':'jpg';const key=`exam-events/${eventId}/${kind}-${Date.now()}.${extension}`;return storage.uploadBuffer(file.buffer,key,file.mimetype);}
async function removeEventMedia(key){if(key)await storage.deleteFile(key);}
module.exports={getSignedMediaUrl,uploadEventMedia,removeEventMedia};
