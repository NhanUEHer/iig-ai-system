// Candidate registration profile kept in this browser (set by the home-page registration form).
// Entering an exam requires a complete profile; otherwise the candidate is sent to the form.
export const PROFILE_KEY = 'exam-candidate-profile'
export const RETURN_TO_KEY = 'exam-profile-return-to'
export const REGISTRATION_URL = '/#registration'

export function readCandidateProfile() {
  try {
    const profile = JSON.parse(window.localStorage.getItem(PROFILE_KEY) || 'null')
    return profile && typeof profile === 'object' ? profile : null
  } catch {
    return null
  }
}

export function profileProblems(profile) {
  const problems = []
  if (!String(profile?.fullName || '').trim()) problems.push('họ và tên')
  if (String(profile?.phone || '').replace(/\D/g, '').length < 9) problems.push('số điện thoại')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(profile?.email || '').trim())) problems.push('email')
  if (profile?.privacyConsent !== true) problems.push('xác nhận đồng ý quy định dự thi')
  return problems
}

export const isCandidateProfileComplete = profile => profileProblems(profile).length === 0

/** Returns true when the candidate may continue; otherwise redirects to the registration form. */
export function requireCandidateProfile(returnTo) {
  if (isCandidateProfileComplete(readCandidateProfile())) return true
  try {
    if (returnTo) window.sessionStorage.setItem(RETURN_TO_KEY, returnTo)
  } catch { /* storage unavailable: still redirect */ }
  window.location.href = REGISTRATION_URL
  return false
}

export function takeReturnTo() {
  try {
    const value = window.sessionStorage.getItem(RETURN_TO_KEY)
    window.sessionStorage.removeItem(RETURN_TO_KEY)
    return value && value.startsWith('/exams') ? value : null
  } catch {
    return null
  }
}

export function hasPendingReturn() {
  try { return Boolean(window.sessionStorage.getItem(RETURN_TO_KEY)) } catch { return false }
}
