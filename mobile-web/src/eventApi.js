export async function getPublicExamEvent(eventId,{signal}={}){
  const response=await fetch(`/api/public/exam-events/${encodeURIComponent(eventId)}`,{signal,headers:{Accept:'application/json'}});
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(body?.error||'Không thể tải thông tin kỳ thi.');
    error.status=response.status;
    error.code=body?.code;
    throw error;
  }
  return body.data;
}

export async function registerExamCandidate(eventId,data){
  const response=await fetch(`/api/public/exam-events/${encodeURIComponent(eventId)}/registrations`,{
    method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify(data),
  });
  const body=await response.json().catch(()=>null);
  if(!response.ok){
    const error=new Error(body?.error||'Không thể lưu thông tin. Vui lòng thử lại.');
    error.status=response.status;error.code=body?.code;error.details=body?.details;
    throw error;
  }
  return body.data;
}

async function candidateRequest(path,candidateToken,options={}){
  const response=await fetch(path,{...options,headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Bearer ${candidateToken}`,...options.headers}});
  const body=await response.json().catch(()=>null);
  if(!response.ok){const error=new Error(body?.error||'Không thể tiếp tục. Vui lòng thử lại.');error.status=response.status;error.code=body?.code;throw error;}
  return body.data;
}

export function getExamIntroduction(eventId,candidateToken){
  return candidateRequest(`/api/public/exam-events/${encodeURIComponent(eventId)}/introduction`,candidateToken);
}

export function startExamAttempt(eventId,candidateToken,{audioConfirmed}){
  return candidateRequest(`/api/public/exam-events/${encodeURIComponent(eventId)}/attempts`,candidateToken,{method:'POST',body:JSON.stringify({audioConfirmed})});
}

export function getAttemptQuestions(eventId,attemptId,attemptToken){
  return candidateRequest(`/api/public/exam-events/${encodeURIComponent(eventId)}/attempts/${encodeURIComponent(attemptId)}/questions`,attemptToken);
}

export function saveAttemptAnswer(eventId,attemptId,subQuestionId,attemptToken,data){
  return candidateRequest(`/api/public/exam-events/${encodeURIComponent(eventId)}/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(subQuestionId)}`,attemptToken,{
    method:'PUT',body:JSON.stringify(data),
  });
}

export function getAttemptSubmissionSummary(eventId,attemptId,attemptToken){
  return candidateRequest(`/api/public/exam-events/${encodeURIComponent(eventId)}/attempts/${encodeURIComponent(attemptId)}/submission-summary`,attemptToken);
}

export function submitExamAttempt(eventId,attemptId,attemptToken){
  return candidateRequest(`/api/public/exam-events/${encodeURIComponent(eventId)}/attempts/${encodeURIComponent(attemptId)}/submit`,attemptToken,{method:'POST',body:'{}'});
}
