const LEASE_TTL_MS = 8000
const HEARTBEAT_MS = 2000

const lockName = (examId, attemptId) => `iig-exam-attempt:${examId}:${attemptId}`
const leaseKey = (examId, attemptId) => `exam-tab-lock:${examId}:${attemptId}`
const BROWSER_SESSION_KEY = 'exam-browser-session-id'

function parseLease(value) {
  try { return JSON.parse(value || 'null') } catch { return null }
}

function createOwnerId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getExamBrowserSessionId() {
  let sessionId = window.localStorage.getItem(BROWSER_SESSION_KEY)
  if (!sessionId) {
    sessionId = createOwnerId()
    window.localStorage.setItem(BROWSER_SESSION_KEY, sessionId)
  }
  return sessionId
}

function acquireLease(examId, attemptId, emit) {
  const key = leaseKey(examId, attemptId)
  const ownerId = createOwnerId()
  let heartbeat = null
  let active = false

  const currentLease = () => parseLease(window.localStorage.getItem(key))
  const writeLease = () => window.localStorage.setItem(key, JSON.stringify({ ownerId, expiresAt: Date.now() + LEASE_TTL_MS }))
  const existing = currentLease()
  if (existing?.ownerId !== ownerId && Number(existing?.expiresAt || 0) > Date.now()) {
    emit('blocked')
    return () => {}
  }

  writeLease()
  if (currentLease()?.ownerId !== ownerId) {
    emit('blocked')
    return () => {}
  }

  active = true
  emit('acquired')
  heartbeat = window.setInterval(() => {
    const lease = currentLease()
    if (lease?.ownerId !== ownerId && Number(lease?.expiresAt || 0) > Date.now()) {
      active = false
      window.clearInterval(heartbeat)
      emit('blocked')
      return
    }
    writeLease()
  }, HEARTBEAT_MS)

  const onStorage = event => {
    if (event.key !== key || !active) return
    const lease = parseLease(event.newValue)
    if (lease?.ownerId !== ownerId && Number(lease?.expiresAt || 0) > Date.now()) {
      active = false
      window.clearInterval(heartbeat)
      emit('blocked')
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    active = false
    if (heartbeat) window.clearInterval(heartbeat)
    window.removeEventListener('storage', onStorage)
    if (currentLease()?.ownerId === ownerId) window.localStorage.removeItem(key)
  }
}

export function acquireExamAttemptTab({ examId, attemptId, onStateChange }) {
  let disposed = false
  let release = null
  let releaseBrowserLock = null
  let requestTimer = null
  const emit = state => { if (!disposed) onStateChange(state) }

  if (!navigator.locks?.request) return acquireLease(examId, attemptId, emit)

  // React StrictMode mounts, cleans up and mounts effects again in development.
  // Defer the browser-lock request so the throw-away effect can be cancelled
  // before it briefly owns the lock and makes the real mount look like tab #2.
  requestTimer = window.setTimeout(() => {
    navigator.locks.request(lockName(examId, attemptId), { ifAvailable: true }, lock => {
      if (disposed || !lock) {
        if (!disposed) emit('blocked')
        return undefined
      }
      emit('acquired')
      return new Promise(resolve => { releaseBrowserLock = resolve })
    }).catch(() => {
      if (!disposed) release = acquireLease(examId, attemptId, emit)
    })
  }, 0)

  return () => {
    disposed = true
    if (requestTimer) window.clearTimeout(requestTimer)
    releaseBrowserLock?.()
    release?.()
  }
}
