const db = require('../../config/db');

async function create(data) {
  const result = await db.query(`INSERT INTO content_sources
    (source_type,original_filename,mime_type,file_size,checksum,storage_key,status,extraction_method,extracted_text,detected_content,usage_metadata,error_message,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [
    data.sourceType,data.filename,data.mimeType,data.fileSize,data.checksum,data.storageKey,data.status,
    data.extractionMethod,data.extractedText,JSON.stringify(data.detectedContent||{}),JSON.stringify(data.usageMetadata||{}),data.errorMessage,data.userId
  ]);
  return map(result.rows[0]);
}

async function list(userId,{page=1,limit=20}={}) {
  const safePage=Math.max(1,Number(page)||1),safeLimit=Math.min(50,Math.max(1,Number(limit)||20)),offset=(safePage-1)*safeLimit;
  const [rows,count]=await Promise.all([
    db.query(`SELECT source.*,
      analysis.id AS analysis_id,analysis.analysis,analysis.validation_metadata,analysis.usage_metadata AS analysis_usage,
      analysis.model AS analysis_model,analysis.source_text_hash AS analysis_source_text_hash,analysis.created_at AS analyzed_at,
      analysis.schema_version AS analysis_schema_version,analysis.provider AS analysis_provider,analysis.provider_run_id,
      analysis.review_label,analysis.review_note,analysis.reviewed_by,analysis.reviewed_at
      FROM content_sources source LEFT JOIN LATERAL(
        SELECT * FROM content_source_analyses WHERE source_id=source.id AND status='completed' ORDER BY created_at DESC LIMIT 1
      ) analysis ON TRUE
      WHERE source.created_by=$1 ORDER BY source.created_at DESC LIMIT $2 OFFSET $3`,[userId,safeLimit,offset]),
    db.query('SELECT COUNT(*)::int total FROM content_sources WHERE created_by=$1',[userId])
  ]);
  const total=count.rows[0]?.total||0;
  return {data:rows.rows.map(mapWithAnalysis),meta:{page:safePage,limit:safeLimit,total,totalPages:Math.max(1,Math.ceil(total/safeLimit))}};
}

async function findOwned(id,userId){
  const result=await db.query(`SELECT source.*,
    analysis.id AS analysis_id,analysis.analysis,analysis.validation_metadata,analysis.usage_metadata AS analysis_usage,
    analysis.model AS analysis_model,analysis.source_text_hash AS analysis_source_text_hash,analysis.created_at AS analyzed_at,
    analysis.schema_version AS analysis_schema_version,analysis.provider AS analysis_provider,analysis.provider_run_id,
    analysis.review_label,analysis.review_note,analysis.reviewed_by,analysis.reviewed_at
    FROM content_sources source LEFT JOIN LATERAL(
      SELECT * FROM content_source_analyses WHERE source_id=source.id AND status='completed' ORDER BY created_at DESC LIMIT 1
    ) analysis ON TRUE WHERE source.id=$1 AND source.created_by=$2`,[id,userId]);
  if(!result.rows[0])return null;
  return mapWithAnalysis(result.rows[0]);
}

async function findAnalysisByHash(sourceId,hash,userId,schemaVersion='source-analysis-v1'){
  const result=await db.query(`SELECT analysis.* FROM content_source_analyses analysis
    JOIN content_sources source ON source.id=analysis.source_id
    WHERE analysis.source_id=$1 AND analysis.source_text_hash=$2 AND analysis.schema_version=$4 AND analysis.status='completed' AND source.created_by=$3 LIMIT 1`,[sourceId,hash,userId,schemaVersion]);
  return result.rows[0]||null;
}

async function createAnalysis(data){
  const result=await db.query(`INSERT INTO content_source_analyses
    (source_id,source_text,source_text_hash,model,analysis,validation_metadata,usage_metadata,created_by,schema_version,provider,provider_run_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[data.sourceId,data.sourceText,data.sourceTextHash,data.model,JSON.stringify(data.analysis),JSON.stringify(data.validationMetadata),JSON.stringify(data.usageMetadata),data.userId,data.schemaVersion||'source-analysis-v1',data.provider||'gemini',data.providerRunId||null]);
  return result.rows[0];
}

async function updateReview({analysisId,userId,label,note}){
  const result=await db.query(`UPDATE content_source_analyses analysis SET
    review_label=$3,review_note=$4,reviewed_by=$2,reviewed_at=CURRENT_TIMESTAMP
    FROM content_sources source
    WHERE analysis.id=$1 AND source.id=analysis.source_id AND source.created_by=$2
    RETURNING analysis.*`,[analysisId,userId,label,note||null]);
  return result.rows[0]||null;
}

async function remove(id,userId){const result=await db.query('DELETE FROM content_sources WHERE id=$1 AND created_by=$2 RETURNING id,storage_key',[id,userId]);return result.rows[0]||null;}

function map(row){return {id:row.id,sourceType:row.source_type,filename:row.original_filename,mimeType:row.mime_type,fileSize:Number(row.file_size||0),status:row.status,extractionMethod:row.extraction_method,extractedText:row.extracted_text,detectedContent:row.detected_content||{},usageMetadata:row.usage_metadata||{},errorMessage:row.error_message,createdAt:row.created_at};}
function mapWithAnalysis(row){const item=map(row);if(row.analysis_id)item.latestAnalysis={id:row.analysis_id,analysis:row.analysis,validationMetadata:row.validation_metadata||{},usageMetadata:row.analysis_usage||{},model:row.analysis_model,provider:row.analysis_provider||'gemini',providerRunId:row.provider_run_id||null,schemaVersion:row.analysis_schema_version||row.analysis?.schemaVersion||'source-analysis-v1',sourceTextHash:row.analysis_source_text_hash,reviewLabel:row.review_label||'NEEDS_REVIEW',reviewNote:row.review_note||'',reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,createdAt:row.analyzed_at};return item;}
module.exports={create,list,findOwned,findAnalysisByHash,createAnalysis,updateReview,remove};
