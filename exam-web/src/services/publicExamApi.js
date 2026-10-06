const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

async function request(path, options = {}) {
  const { token, ...requestOptions } = options
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    const error = new Error(payload?.error || payload?.message || 'Không thể tải dữ liệu đề thi.')
    error.code = payload?.code || 'REQUEST_FAILED'
    error.status = response.status
    error.details = payload?.details
    throw error
  }
  return payload
}

export const getPublicExamGroups = () => request('/public/exams/groups')

export const getPublicExamDetail = examId => request(`/public/exams/${encodeURIComponent(examId)}`)

export const registerExamCandidate = ({ examId, candidate }) => request(
  `/public/exams/${encodeURIComponent(examId)}/candidates`,
  { method: 'POST', body: JSON.stringify(candidate) },
)

export const startExamAttempt = ({ examId, candidateToken, audioConfirmed, clientSessionId }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts`,
  { method: 'POST', token: candidateToken, body: JSON.stringify({ audioConfirmed, clientSessionId }) },
)

export const getAttemptStructure = ({ examId, attemptId, attemptToken }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/structure`,
  { token: attemptToken },
)

export const resumeExamAttempt = ({ examId, attemptId, attemptToken }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/resume`,
  { method: 'POST', token: attemptToken, body: '{}' },
)

export const getAttemptPartQuestions = ({ examId, attemptId, attemptToken, partId }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/parts/${encodeURIComponent(partId)}/questions`,
  { token: attemptToken },
)

export const getAttemptQuestionGroup = ({ examId, attemptId, attemptToken, parentQuestionId }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/question-groups/${encodeURIComponent(parentQuestionId)}`,
  { token: attemptToken },
)

export const saveAttemptAnswer = ({ examId, attemptId, attemptToken, subQuestionId, selectedOptionKey }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/answers/${encodeURIComponent(subQuestionId)}`,
  { method: 'PUT', token: attemptToken, body: JSON.stringify({ selectedOptionKey }) },
)

export const submitExamAttempt = ({ examId, attemptId, attemptToken }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/submit`,
  { method: 'POST', token: attemptToken, body: '{}' },
)

export const getExamAttemptResult = ({ examId, attemptId, attemptToken }) => request(
  `/public/exams/${encodeURIComponent(examId)}/attempts/${encodeURIComponent(attemptId)}/result`,
  { token: attemptToken },
)

export function getPublicExams(filters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== undefined && value !== null) params.set(key, value)
  })
  return request(`/public/exams?${params}`)
}
