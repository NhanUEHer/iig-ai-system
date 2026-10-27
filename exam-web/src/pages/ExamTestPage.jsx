import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAttemptPartQuestions, getAttemptQuestionGroup, getPublicExamDetail, resumeExamAttempt, saveAttemptAnswer, submitExamAttempt } from '../services/publicExamApi'
import { acquireExamAttemptTab } from '../services/examAttemptTabLock'
import { getNextFreestyleTransitionIndex, shouldPauseBetweenListeningGroups } from '../services/examFlow'
import { LegacyMcqQuestionGroup, ToeflListeningMcq, ToeflReadingMcq } from '../components/exam/McqQuestionGroup'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>
const AUTO_AUDIO_MODES = new Set(['NON_STOP', 'RECORD_NON_STOP'])

function safeHtml(html) {
  if (!html) return ''
  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  documentNode.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove())
  documentNode.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attribute => {
    const unsafeUrl = /^(href|src)$/i.test(attribute.name) && /^javascript:/i.test(attribute.value.trim())
    if (attribute.name.startsWith('on') || attribute.name === 'style' || unsafeUrl) node.removeAttribute(attribute.name)
  }))
  return documentNode.body.innerHTML
}

function displayPromptHtml(html) {
  return safeHtml(html).replace(/^(\s*(?:<[^>]+>\s*)*)(?:Question\s+)?\d+\.\s*/i, '$1')
}

function displayOptionText(text, key) {
  const escapedKey = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return String(text || '').replace(new RegExp(`^\\s*${escapedKey}\\s*[.)]\\s*`, 'i'), '')
}

function CompleteWordField({ question, disabled, onChange, onBlur }) {
  const inputLength = Math.max(1, Number(question.inputLength || 1))
  const value = String(question.textAnswer || '').slice(0, inputLength)
  const inputRefs = useRef([])
  const characterAt = index => value[index] && value[index] !== ' ' ? value[index] : ''
  const updateCharacters = (startIndex, rawValue) => {
    const characters = Array.from({ length: inputLength }, (_, index) => characterAt(index) || ' ')
    const incoming = Array.from(String(rawValue || ''))
    if (!incoming.length) characters[startIndex] = ' '
    else incoming.slice(0, inputLength - startIndex).forEach((character, offset) => { characters[startIndex + offset] = character })
    onChange(question.id, characters.join(''))
    const nextIndex = Math.min(inputLength - 1, startIndex + Math.max(1, incoming.length))
    if (incoming.length && startIndex < inputLength - 1) window.requestAnimationFrame(() => inputRefs.current[nextIndex]?.focus())
  }
  const handleKeyDown = (event, index) => {
    if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); inputRefs.current[index - 1]?.focus() }
    if (event.key === 'ArrowRight' && index < inputLength - 1) { event.preventDefault(); inputRefs.current[index + 1]?.focus() }
    if (event.key === 'Backspace' && !characterAt(index) && index > 0) { event.preventDefault(); inputRefs.current[index - 1]?.focus() }
  }
  return <span className="complete-word-field" style={{ '--character-count': inputLength }}>
    {Array.from({ length: inputLength }, (_, index) => <input
      key={index}
      ref={element => { inputRefs.current[index] = element }}
      aria-label={`Khoảng trống ${question.gapIndex}, ký tự ${index + 1} trên ${inputLength}`}
      autoComplete="off"
      disabled={disabled}
      inputMode="text"
      maxLength={1}
      value={characterAt(index)}
      onChange={event => updateCharacters(index, event.target.value)}
      onKeyDown={event => handleKeyDown(event, index)}
      onPaste={event => { event.preventDefault(); updateCharacters(index, event.clipboardData.getData('text')) }}
      onBlur={() => onBlur(question.id)}
    />)}
  </span>
}

const COMPLETE_WORD_TAGS = new Set(['p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'br', 'ul', 'ol', 'li'])
function renderCompleteWordsStem(html, questions, onChange, onBlur, disabled) {
  const documentNode = new DOMParser().parseFromString(safeHtml(html), 'text/html')
  const byIndex = new Map(questions.map(question => [Number(question.gapIndex), question]))
  let key = 0
  const renderText = text => String(text || '').split(/(\[\d+\])/g).filter(Boolean).map(part => {
    const match = part.match(/^\[(\d+)\]$/)
    if (!match) return part
    const question = byIndex.get(Number(match[1]))
    if (!question) return part
    return <CompleteWordField key={`gap-${question.id}`} question={question} disabled={disabled} onChange={onChange} onBlur={onBlur} />
  })
  const renderNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return renderText(node.textContent)
    if (node.nodeType !== Node.ELEMENT_NODE) return null
    const tag = node.tagName.toLowerCase()
    const children = [...node.childNodes].flatMap(child => renderNode(child) || [])
    if (!COMPLETE_WORD_TAGS.has(tag)) return children
    return createElement(tag, { key: `node-${key++}` }, children)
  }
  return [...documentNode.body.childNodes].flatMap(node => renderNode(node) || [])
}

function formatClock(value) {
  const seconds = Math.max(0, Number(value || 0))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return [hours, minutes, rest].map(item => String(item).padStart(2, '0')).join(':')
}

function readAttemptSession(examId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(`exam-attempt:${examId}`) || 'null')
    return stored?.examId === examId && stored?.attemptId && stored?.attemptToken ? stored : null
  } catch { return null }
}

function readMarkedQuestions(examId, attemptId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(`exam-marks:${examId}:${attemptId}`) || '[]')
    return new Set(Array.isArray(stored) ? stored.filter(Boolean) : [])
  } catch { return new Set() }
}

function readAttemptPosition(examId, attemptId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(`exam-position:${examId}:${attemptId}`) || 'null')
    return stored?.partId ? stored : null
  } catch { return null }
}

function writeAttemptPosition(examId, attemptId, partId, groupId = null, phase = 'question') {
  if (!attemptId || !partId) return
  window.localStorage.setItem(`exam-position:${examId}:${attemptId}`, JSON.stringify({ partId, groupId, phase, updatedAt: new Date().toISOString() }))
}

function attemptExpiryTime(session) {
  const direct = new Date(session?.expiresAt || 0).getTime()
  if (Number.isFinite(direct) && direct > 0) return direct
  try {
    const encoded = String(session?.attemptToken || '').split('.')[1]
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')))
    return Number(payload.exp || 0) * 1000
  } catch { return 0 }
}

const wait = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds))

async function saveAnswerWithRetry(input, retries = 2) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try { return await saveAttemptAnswer(input) } catch (error) {
      lastError = error
      if (attempt < retries) await wait(400 * (attempt + 1))
    }
  }
  throw lastError
}

function ExamTestPage({ examId }) {
  const session = useMemo(() => readAttemptSession(examId), [examId])
  const sessionExpiry = useMemo(() => attemptExpiryTime(session), [session])
  const [exam, setExam] = useState(null)
  const [error, setError] = useState('')
  const [partIndex, setPartIndex] = useState(0)
  const [phase, setPhase] = useState('introduction')
  const [audioState, setAudioState] = useState('idle')
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [groupIndex, setGroupIndex] = useState(0)
  const [groupList, setGroupList] = useState([])
  const [partQuestionList, setPartQuestionList] = useState([])
  const [questionGroup, setQuestionGroup] = useState(null)
  const [answeredIds, setAnsweredIds] = useState(new Set())
  const [markedIds, setMarkedIds] = useState(() => new Set())
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState('content')
  const [locked, setLocked] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toeflListeningPhase, setToeflListeningPhase] = useState('audio')
  const [listeningSubIndex, setListeningSubIndex] = useState(0)
  const [readingSubIndex, setReadingSubIndex] = useState(0)
  const [questionRemainingSeconds, setQuestionRemainingSeconds] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [timeExpired, setTimeExpired] = useState(() => Boolean(sessionExpiry && sessionExpiry <= Date.now()))
  const [positionReady, setPositionReady] = useState(false)
  const [tabAccess, setTabAccess] = useState(() => session ? 'checking' : 'acquired')
  const [resumeReady, setResumeReady] = useState(() => !session)
  const audioRef = useRef(null)
  const audioAbortRef = useRef(null)
  const audioWatchdogRef = useRef(null)
  const playbackRunRef = useRef(0)
  const pendingSavesRef = useRef(new Map())
  const failedSavesRef = useRef(new Set())
  const latestAnswersRef = useRef(new Map())
  const resumeAttemptedRef = useRef(false)
  const countdownAudioContextRef = useRef(null)
  const listeningTransitionRef = useRef(false)

  useEffect(() => {
    if (!session?.attemptId) {
      setTabAccess('acquired')
      return undefined
    }
    setTabAccess('checking')
    return acquireExamAttemptTab({
      examId,
      attemptId: session.attemptId,
      onStateChange: setTabAccess,
    })
  }, [examId, session?.attemptId])

  useEffect(() => {
    if (tabAccess !== 'acquired' || !session?.attemptId) return
    let active = true
    setResumeReady(false)
    resumeExamAttempt(session).then(result => {
      if (!active) return
      setRemainingSeconds(result.data.remainingSeconds)
      setAnsweredIds(new Set(result.data.answeredQuestionIds || []))
      if (result.data.remainingSeconds <= 0) setTimeExpired(true)
      setResumeReady(true)
    }).catch(requestError => {
      if (!active) return
      setError(requestError.message)
      setResumeReady(true)
    })
    return () => { active = false }
  }, [session, tabAccess])

  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    getPublicExamDetail(examId).then(result => {
      if (!active) return
      setExam(result.data)
      const expiryRemaining = sessionExpiry ? Math.max(0, Math.ceil((sessionExpiry - Date.now()) / 1000)) : null
      setRemainingSeconds(expiryRemaining == null ? Number(result.data?.durationSeconds || 0) : expiryRemaining)
      if (expiryRemaining === 0) setTimeExpired(true)
    }).catch(requestError => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [examId, sessionExpiry])

  useEffect(() => {
    if (!exam || session) return
    let candidate = null
    try { candidate = JSON.parse(window.localStorage.getItem(`exam-candidate:${examId}`) || 'null') } catch { candidate = null }
    window.location.replace(candidate?.examId === examId && candidate?.candidateToken ? `/exams/${examId}/structure` : `/exams/${examId}`)
  }, [exam, examId, session])

  useEffect(() => {
    if (!exam || remainingSeconds <= 0) return undefined
    const timer = window.setInterval(() => setRemainingSeconds(value => {
      const next = sessionExpiry ? Math.max(0, Math.ceil((sessionExpiry - Date.now()) / 1000)) : Math.max(0, value - 1)
      if (next <= 0) {
        setTimeExpired(true)
        return 0
      }
      return next
    }), 1000)
    return () => window.clearInterval(timer)
  }, [exam, remainingSeconds <= 0, sessionExpiry])

  const parts = useMemo(() => (exam?.sections || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap(section => (section.parts || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
      .map(part => ({ ...part, sectionId: section.id, examMode: section.examMode, sectionTitle: section.title }))), [exam])
  const activePart = parts[partIndex] || null
  const isToeflListening = exam?.testType === 'TOEFL_IBT' && activePart?.examMode === 'NON_STOP'
  const isToeflReading = exam?.testType === 'TOEFL_IBT' && activePart?.examMode === 'FREESTYLE'
  const requiresAudio = AUTO_AUDIO_MODES.has(activePart?.examMode)
  const isFreestyle = activePart?.examMode === 'FREESTYLE'
  const introHtml = useMemo(() => safeHtml(activePart?.instructionHtml), [activePart?.instructionHtml])
  const instructionAudioUrl = activePart?.instructionAudio?.url || ''
  const instructionAudioDurationSeconds = Math.max(0, Number(activePart?.instructionAudio?.durationSeconds || 0))
  const questionGroupId = questionGroup?.id || null
  const questionAudioUrl = questionGroup?.content?.audioUrl || ''
  const questionAudioDurationSeconds = Math.max(0, Number(questionGroup?.content?.media?.find(item => item.type === 'AUDIO')?.durationSeconds || 0))
  const questionBreakDurationSeconds = Math.max(0, Number(questionGroup?.breakDurationSeconds || 0))
  const answerDurationSeconds = Math.max(1, Number(activePart?.answerDurationSeconds || questionGroup?.answerDurationSeconds || 1))
  const hasNextQuestionGroup = Boolean(groupList[groupIndex + 1])
  const isCompleteWordsGroup = questionGroup?.questions?.[0]?.questionType === 'COMPLETE_WORDS'

  useEffect(() => {
    if (isToeflReading) setNavigatorOpen(false)
  }, [isToeflReading])

  useEffect(() => {
    if (!session?.attemptId) return
    setMarkedIds(readMarkedQuestions(examId, session.attemptId))
  }, [examId, session?.attemptId])

  const stopAudio = useCallback(() => {
    playbackRunRef.current += 1
    if (audioWatchdogRef.current) window.clearTimeout(audioWatchdogRef.current)
    audioWatchdogRef.current = null
    const abort = audioAbortRef.current
    audioAbortRef.current = null
    if (abort) abort()
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.onended = null
      audio.onerror = null
      audio.onplaying = null
      audio.onloadedmetadata = null
    }
  }, [])

  const playAudioToEnd = useCallback((url, { expectedDurationSeconds = 0, onPlaying } = {}) => {
    let audio = audioRef.current
    if (!audio) {
      audio = new Audio()
      audio.preload = 'auto'
      audioRef.current = audio
    }
    audio.pause()
    audio.src = url
    audio.currentTime = 0
    audio.load()

    return new Promise((resolve, reject) => {
      let settled = false
      const clearWatchdog = () => {
        if (audioWatchdogRef.current) window.clearTimeout(audioWatchdogRef.current)
        audioWatchdogRef.current = null
      }
      const cleanup = () => {
        clearWatchdog()
        audio.onended = null
        audio.onerror = null
        audio.onplaying = null
        audio.onloadedmetadata = null
        if (audioAbortRef.current === abort) audioAbortRef.current = null
      }
      const finish = (callback, value) => {
        if (settled) return
        settled = true
        cleanup()
        callback(value)
      }
      const timeout = () => {
        const timeoutError = new Error('Audio không tiếp tục phát trong thời gian cho phép.')
        timeoutError.name = 'AudioTimeoutError'
        finish(reject, timeoutError)
      }
      const armPlaybackWatchdog = () => {
        clearWatchdog()
        const mediaDuration = Number.isFinite(audio.duration) ? audio.duration : 0
        const remaining = Math.max(0, (mediaDuration || expectedDurationSeconds) - Number(audio.currentTime || 0))
        audioWatchdogRef.current = window.setTimeout(timeout, Math.max(30, remaining + 20) * 1000)
      }
      const abort = () => {
        const abortError = new Error('Audio playback was cancelled.')
        abortError.name = 'AbortError'
        finish(reject, abortError)
      }

      audioAbortRef.current = abort
      audio.onended = () => finish(resolve)
      audio.onerror = () => finish(reject, new Error('Không thể tải hoặc phát audio.'))
      audio.onloadedmetadata = armPlaybackWatchdog
      audio.onplaying = () => {
        armPlaybackWatchdog()
        onPlaying?.()
      }
      audioWatchdogRef.current = window.setTimeout(timeout, 20 * 1000)
      audio.play().catch(playbackError => finish(reject, playbackError))
    })
  }, [])

  const loadQuestionGroup = useCallback(async (groups, index, partId, listeningMode) => {
    if (!session || !groups[index]) return
    setLocked(true)
    setQuestionGroup(null)
    setMobilePane('content')
    setAudioState('loading')
    const result = await getAttemptQuestionGroup({ ...session, parentQuestionId: groups[index].id })
    setRemainingSeconds(result.data.attempt.remainingSeconds)
    setQuestionGroup(result.data.questionGroup)
    setListeningSubIndex(0)
    setReadingSubIndex(0)
    setToeflListeningPhase('audio')
    setQuestionRemainingSeconds(0)
    writeAttemptPosition(examId, session.attemptId, partId, groups[index].id)
    setAnsweredIds(current => {
      const next = new Set(current)
      result.data.questionGroup.questions.forEach(question => { if (question.selectedOption || String(question.textAnswer || '').trim()) next.add(question.id) })
      return next
    })
    setLocked(listeningMode)
    return result.data.questionGroup
  }, [examId, session])

  useEffect(() => {
    if (tabAccess !== 'acquired' || !resumeReady || !exam || !session || !parts.length || resumeAttemptedRef.current) return
    resumeAttemptedRef.current = true
    const position = readAttemptPosition(examId, session.attemptId)
    if (!position || timeExpired) { setPositionReady(true); return }
    const targetPartIndex = parts.findIndex(part => part.id === position.partId)
    if (targetPartIndex < 0) { setPositionReady(true); return }
    setPartIndex(targetPartIndex)
    if (position.phase === 'introduction' || !position.groupId) {
      setPhase('introduction')
      setPositionReady(true)
      return
    }
    let active = true
    setPhase('question')
    setLocked(true)
    getAttemptPartQuestions({ ...session, partId: position.partId }).then(async result => {
      if (!active) return
      const groups = result.data.questionGroups || []
      const targetGroupIndex = groups.findIndex(group => group.id === position.groupId)
      if (targetGroupIndex < 0) throw new Error('Không còn tìm thấy câu hỏi đang làm.')
      setRemainingSeconds(result.data.attempt.remainingSeconds)
      setGroupList(groups)
      setPartQuestionList(result.data.questions || [])
      setAnsweredIds(new Set((result.data.questions || []).filter(question => question.answered).map(question => question.id)))
      setGroupIndex(targetGroupIndex)
      const targetIsToeflListening = exam.testType === 'TOEFL_IBT' && parts[targetPartIndex]?.examMode === 'NON_STOP'
      await loadQuestionGroup(groups, targetGroupIndex, position.partId, targetIsToeflListening)
    }).catch(() => {
      if (!active) return
      setPhase('introduction')
      setGroupList([])
      setPartQuestionList([])
      setQuestionGroup(null)
      setLocked(false)
      writeAttemptPosition(examId, session.attemptId, position.partId, null, 'introduction')
    }).finally(() => { if (active) setPositionReady(true) })
    return () => { active = false }
  }, [exam, examId, loadQuestionGroup, parts, resumeReady, session, tabAccess, timeExpired])

  const startPart = useCallback(async () => {
    stopAudio()
    if (!session) { setPhase('session-required'); return }
    if (timeExpired) return
    if (!['NON_STOP', 'FREESTYLE'].includes(activePart?.examMode)) { setPhase('unsupported-question-mode'); return }
    setPhase('question')
    setGroupIndex(0)
    setLocked(true)
    try {
      const result = await getAttemptPartQuestions({ ...session, partId: activePart.id })
      const groups = result.data.questionGroups || []
      setRemainingSeconds(result.data.attempt.remainingSeconds)
      setGroupList(groups)
      setPartQuestionList(result.data.questions || [])
      setAnsweredIds(current => {
        const next = new Set(current)
        ;(result.data.questions || []).forEach(question => { if (question.answered) next.add(question.id) })
        return next
      })
      if (!groups.length) throw new Error('Part này chưa có câu hỏi.')
      await loadQuestionGroup(groups, 0, activePart.id, isToeflListening)
    } catch (requestError) {
      setError(requestError.message)
      setLocked(false)
    }
  }, [activePart, isToeflListening, loadQuestionGroup, session, stopAudio, timeExpired])

  const playIntroduction = useCallback(async () => {
    if (!instructionAudioUrl) { setAudioState('missing'); return }
    stopAudio()
    const runId = playbackRunRef.current
    setAudioState('loading')
    try {
      await playAudioToEnd(instructionAudioUrl, {
        expectedDurationSeconds: instructionAudioDurationSeconds,
        onPlaying: () => setAudioState('playing'),
      })
      if (runId === playbackRunRef.current) await startPart()
    } catch (playbackError) {
      if (runId !== playbackRunRef.current || playbackError?.name === 'AbortError') return
      setAudioState(playbackError?.name === 'NotAllowedError' ? 'blocked' : 'error')
    }
  }, [instructionAudioDurationSeconds, instructionAudioUrl, playAudioToEnd, startPart, stopAudio])

  useEffect(() => {
    if (!positionReady || phase !== 'introduction' || !requiresAudio || !activePart) return undefined
    if (timeExpired) return undefined
    playIntroduction()
    return stopAudio
  }, [activePart?.id, phase, positionReady, requiresAudio, playIntroduction, stopAudio, timeExpired])

  useEffect(() => {
    if (timeExpired) stopAudio()
  }, [stopAudio, timeExpired])

  const advanceQuestion = useCallback(async () => {
    setLocked(true)
    await Promise.allSettled([...pendingSavesRef.current.values()])
    const nextIndex = groupIndex + 1
    if (groupList[nextIndex]) {
      setGroupIndex(nextIndex)
      await loadQuestionGroup(groupList, nextIndex, activePart.id, isToeflListening).catch(requestError => setError(requestError.message))
      return
    }
    const nextPartIndex = partIndex + 1
    if (parts[nextPartIndex]) {
      stopAudio()
      setPartIndex(nextPartIndex)
      writeAttemptPosition(examId, session?.attemptId, parts[nextPartIndex].id, null, 'introduction')
      setGroupList([])
      setPartQuestionList([])
      setQuestionGroup(null)
      setGroupIndex(0)
      setPhase('introduction')
      setAudioState('idle')
      setLocked(false)
      return
    }
    setPhase('completed')
  }, [activePart?.id, examId, groupIndex, groupList, isToeflListening, loadQuestionGroup, partIndex, parts, session?.attemptId, stopAudio])

  const advanceToeflSubQuestion = useCallback(async () => {
    if (!isToeflListening || !questionGroup || listeningTransitionRef.current) return
    listeningTransitionRef.current = true
    setLocked(true)
    try {
      await Promise.allSettled([...pendingSavesRef.current.values()])
      const nextIndex = listeningSubIndex + 1
      if (questionGroup.questions[nextIndex]) {
        setListeningSubIndex(nextIndex)
        setQuestionRemainingSeconds(answerDurationSeconds)
        setToeflListeningPhase('answer')
        setLocked(false)
        return
      }
      if (shouldPauseBetweenListeningGroups({
        isToeflListening,
        hasNextQuestionGroup,
        isLastSubQuestion: true,
        breakDurationSeconds: questionBreakDurationSeconds,
      })) {
        const transitionRunId = playbackRunRef.current
        setQuestionRemainingSeconds(0)
        setToeflListeningPhase('break')
        setAudioState('break')
        await wait(questionBreakDurationSeconds * 1000)
        if (transitionRunId !== playbackRunRef.current) return
      }
      setToeflListeningPhase('audio')
      await advanceQuestion()
    } finally {
      listeningTransitionRef.current = false
    }
  }, [advanceQuestion, answerDurationSeconds, hasNextQuestionGroup, isToeflListening, listeningSubIndex, questionBreakDurationSeconds, questionGroup])

  useEffect(() => {
    if (!isToeflListening || toeflListeningPhase !== 'answer' || questionRemainingSeconds <= 0) return undefined
    const timer = window.setTimeout(() => setQuestionRemainingSeconds(value => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [isToeflListening, questionRemainingSeconds, toeflListeningPhase])

  useEffect(() => {
    if (!isToeflListening || toeflListeningPhase !== 'answer' || questionRemainingSeconds < 1 || questionRemainingSeconds > 5) return
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return
    try {
      const context = countdownAudioContextRef.current || new AudioContextClass()
      countdownAudioContextRef.current = context
      const playTick = () => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(920, context.currentTime)
        gain.gain.setValueAtTime(0.0001, context.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.006)
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.075)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(context.currentTime)
        oscillator.stop(context.currentTime + 0.08)
      }
      if (context.state === 'suspended') context.resume().then(playTick).catch(() => {})
      else playTick()
    } catch { /* Countdown remains visible when Web Audio is unavailable. */ }
  }, [isToeflListening, questionRemainingSeconds, toeflListeningPhase])

  useEffect(() => {
    if (!isToeflListening || toeflListeningPhase !== 'answer' || questionRemainingSeconds !== 0) return
    advanceToeflSubQuestion()
  }, [advanceToeflSubQuestion, isToeflListening, questionRemainingSeconds, toeflListeningPhase])

  const playQuestionAudio = useCallback(async ({ manual = false } = {}) => {
    if (!questionAudioUrl) { setAudioState('error'); return }
    stopAudio()
    const runId = playbackRunRef.current
    setAudioState('loading')
    try {
      await playAudioToEnd(questionAudioUrl, {
        expectedDurationSeconds: questionAudioDurationSeconds,
        onPlaying: () => setAudioState('playing'),
      })
      if (runId !== playbackRunRef.current) return
      if (isToeflListening) {
        setListeningSubIndex(0)
        setQuestionRemainingSeconds(answerDurationSeconds)
        setToeflListeningPhase('answer')
        setAudioState('complete')
        setLocked(false)
        return
      }
      if (hasNextQuestionGroup && questionBreakDurationSeconds > 0) {
        setAudioState('break')
        await wait(questionBreakDurationSeconds * 1000)
      }
      if (runId === playbackRunRef.current) await advanceQuestion()
    } catch (playbackError) {
      if (runId !== playbackRunRef.current || playbackError?.name === 'AbortError') return
      if (!manual && playbackError?.name === 'NotAllowedError') { setAudioState('blocked'); return }
      setAudioState('error')
    }
  }, [advanceQuestion, answerDurationSeconds, hasNextQuestionGroup, isToeflListening, playAudioToEnd, questionAudioDurationSeconds, questionAudioUrl, questionBreakDurationSeconds, stopAudio])

  useEffect(() => {
    if (phase !== 'question' || !questionGroupId || !requiresAudio) return undefined
    playQuestionAudio()
    return stopAudio
  }, [phase, questionGroupId, playQuestionAudio, requiresAudio, stopAudio])

  const openFreestyleGroup = useCallback(async index => {
    if (!isFreestyle || locked || !groupList[index]) return
    setLocked(true)
    setSaveError('')
    try {
      await Promise.allSettled([...pendingSavesRef.current.values()])
      setGroupIndex(index)
      const loadedGroup = await loadQuestionGroup(groupList, index, activePart.id, false)
      if (!isToeflReading) setNavigatorOpen(false)
      return loadedGroup
    } catch (requestError) {
      setSaveError(requestError.message)
      setLocked(false)
    }
  }, [activePart?.id, groupList, isFreestyle, isToeflReading, loadQuestionGroup, locked])

  const openFreestyleQuestion = useCallback(async (targetGroupIndex, questionId) => {
    if (!isToeflReading || locked) return
    if (targetGroupIndex === groupIndex) {
      const targetSubIndex = questionGroup?.questions?.findIndex(question => question.id === questionId) ?? -1
      if (targetSubIndex >= 0) setReadingSubIndex(targetSubIndex)
      return
    }
    const loadedGroup = await openFreestyleGroup(targetGroupIndex)
    const targetSubIndex = loadedGroup?.questions?.findIndex(question => question.id === questionId) ?? -1
    if (targetSubIndex >= 0) setReadingSubIndex(targetSubIndex)
  }, [groupIndex, isToeflReading, locked, openFreestyleGroup, questionGroup?.questions])

  const previousFreestylePartIndex = partIndex > 0
    && parts[partIndex - 1]?.examMode === 'FREESTYLE'
    && parts[partIndex - 1]?.sectionId === activePart?.sectionId ? partIndex - 1 : -1
  const nextFreestyleTransitionIndex = getNextFreestyleTransitionIndex(parts, partIndex, isToeflReading)

  const openPreviousFreestylePart = useCallback(async () => {
    if (previousFreestylePartIndex < 0 || locked || !session) return
    setLocked(true)
    setSaveError('')
    try {
      await Promise.allSettled([...pendingSavesRef.current.values()])
      const targetPart = parts[previousFreestylePartIndex]
      const result = await getAttemptPartQuestions({ ...session, partId: targetPart.id })
      const groups = result.data.questionGroups || []
      if (!groups.length) throw new Error('Part trước chưa có câu hỏi.')
      setPartIndex(previousFreestylePartIndex)
      setGroupList(groups)
      setPartQuestionList(result.data.questions || [])
      setGroupIndex(groups.length - 1)
      await loadQuestionGroup(groups, groups.length - 1, targetPart.id, false)
    } catch (requestError) {
      setSaveError(requestError.message)
      setLocked(false)
    }
  }, [loadQuestionGroup, locked, parts, previousFreestylePartIndex, session])

  const openNextPartIntro = useCallback(async () => {
    if (nextFreestyleTransitionIndex < 0 || locked) return
    await Promise.allSettled([...pendingSavesRef.current.values()])
    setPartIndex(nextFreestyleTransitionIndex)
    writeAttemptPosition(examId, session?.attemptId, parts[nextFreestyleTransitionIndex].id, null, 'introduction')
    setGroupList([])
    setPartQuestionList([])
    setQuestionGroup(null)
    setGroupIndex(0)
    setNavigatorOpen(false)
    setAudioState('idle')
    setPhase('introduction')
    setLocked(false)
  }, [examId, locked, nextFreestyleTransitionIndex, parts, session?.attemptId])

  const toggleCurrentGroupMark = () => {
    if (!isFreestyle || !session?.attemptId) return
    const questionIds = isToeflReading && !isCompleteWordsGroup
      ? [questionGroup?.questions?.[readingSubIndex]?.id].filter(Boolean)
      : (questionGroup?.questions || []).map(question => question.id)
    if (!questionIds.length) return
    setMarkedIds(current => {
      const next = new Set(current)
      const allMarked = questionIds.every(questionId => next.has(questionId))
      questionIds.forEach(questionId => allMarked ? next.delete(questionId) : next.add(questionId))
      window.localStorage.setItem(`exam-marks:${examId}:${session.attemptId}`, JSON.stringify([...next]))
      return next
    })
  }

  const chooseOption = (questionId, optionKey) => {
    if (locked) return
    if (latestAnswersRef.current.get(questionId)?.selectedOptionKey === optionKey) return
    setSaveError('')
    setQuestionGroup(current => ({ ...current, questions: current.questions.map(question => question.id === questionId ? { ...question, selectedOption: optionKey } : question) }))
    setAnsweredIds(current => new Set(current).add(questionId))
    if (!session) return
    latestAnswersRef.current.set(questionId, { selectedOptionKey: optionKey })
    const previous = pendingSavesRef.current.get(questionId) || Promise.resolve()
    const request = previous.catch(() => null)
      .then(() => saveAnswerWithRetry({ ...session, subQuestionId: questionId, selectedOptionKey: optionKey }))
      .then(result => { failedSavesRef.current.delete(questionId); return result })
      .catch(requestError => {
        failedSavesRef.current.add(questionId)
        setSaveError(`Chưa lưu được đáp án câu này. Hệ thống sẽ tự thử lại trước khi nộp bài: ${requestError.message}`)
        return null
      })
      .finally(() => {
        if (pendingSavesRef.current.get(questionId) === request) pendingSavesRef.current.delete(questionId)
      })
    pendingSavesRef.current.set(questionId, request)
  }

  const changeTextAnswer = (questionId, value) => {
    if (locked) return
    setQuestionGroup(current => ({ ...current, questions: current.questions.map(question => question.id === questionId ? { ...question, textAnswer: value } : question) }))
    if (String(value).trim()) setAnsweredIds(current => new Set(current).add(questionId))
    else setAnsweredIds(current => { const next = new Set(current); next.delete(questionId); return next })
    latestAnswersRef.current.set(questionId, { textAnswer: value })
  }

  const persistTextAnswer = questionId => {
    if (!session || locked) return
    const payload = latestAnswersRef.current.get(questionId) || { textAnswer: questionGroup?.questions.find(question => question.id === questionId)?.textAnswer || '' }
    const previous = pendingSavesRef.current.get(questionId) || Promise.resolve()
    const request = previous.catch(() => null)
      .then(() => saveAnswerWithRetry({ ...session, subQuestionId: questionId, ...payload }))
      .then(result => { failedSavesRef.current.delete(questionId); return result })
      .catch(requestError => { failedSavesRef.current.add(questionId); setSaveError(`Chưa lưu được đáp án câu này: ${requestError.message}`); return null })
      .finally(() => { if (pendingSavesRef.current.get(questionId) === request) pendingSavesRef.current.delete(questionId) })
    pendingSavesRef.current.set(questionId, request)
  }

  const submitAttempt = async ({ skipConfirmation = false } = {}) => {
    if (!session || submitting || (!skipConfirmation && !window.confirm('Bạn chắc chắn muốn nộp bài?'))) return
    setSubmitting(true)
    setLocked(true)
    try {
      await Promise.allSettled([...pendingSavesRef.current.values()])
      if (!timeExpired && failedSavesRef.current.size > 0) {
        setSaveError(`Đang thử lưu lại ${failedSavesRef.current.size} câu chưa đồng bộ...`)
        const failedIds = [...failedSavesRef.current]
        await Promise.allSettled(failedIds.map(async questionId => {
          const answerPayload = latestAnswersRef.current.get(questionId)
          if (!answerPayload) return
          try {
            await saveAnswerWithRetry({ ...session, subQuestionId: questionId, ...answerPayload })
            failedSavesRef.current.delete(questionId)
          } catch { /* Keep this id for the explicit warning below. */ }
        }))
        if (failedSavesRef.current.size === 0) setSaveError('')
      }
      if (!skipConfirmation && failedSavesRef.current.size > 0 && !window.confirm(`Có ${failedSavesRef.current.size} câu chưa đồng bộ được lên hệ thống. Bạn vẫn muốn nộp bài?`)) {
        setSubmitting(false)
        setLocked(false)
        return
      }
      const result = await submitExamAttempt(session)
      window.localStorage.setItem(`exam-result:${examId}`, JSON.stringify(result.data))
      window.localStorage.setItem(`exam-result-session:${examId}`, JSON.stringify({
        examId,
        attemptId: session.attemptId,
        attemptToken: session.attemptToken,
      }))
      window.localStorage.removeItem(`exam-attempt:${examId}`)
      window.localStorage.removeItem(`exam-position:${examId}:${session.attemptId}`)
      setTimeExpired(false)
      setPhase('completed')
      window.location.replace(`/exams/${examId}/result`)
    } catch (requestError) {
      setSaveError(requestError.message)
      setLocked(false)
      setSubmitting(false)
    }
  }

  useEffect(() => () => {
    stopAudio()
    countdownAudioContextRef.current?.close().catch(() => {})
    countdownAudioContextRef.current = null
    if (audioRef.current) {
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
      audioRef.current = null
    }
  }, [stopAudio])

  if (tabAccess === 'blocked') return <div className="exam-live-page"><div className="exam-live-state exam-tab-conflict"><span><Icon>tab_unselected</Icon></span><h1>Bài thi đang được mở ở tab khác</h1><p>Để bảo vệ tiến trình và đáp án, mỗi lượt thi chỉ được thao tác trên một tab. Hãy quay lại tab đang làm bài hoặc đóng tab đó trước khi thử lại.</p><div><button type="button" onClick={() => window.location.reload()}><Icon>refresh</Icon>Kiểm tra lại</button><a href={`/exams/${examId}`}>Quay về đề thi</a></div></div></div>
  if (tabAccess === 'checking') return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang kiểm tra phiên làm bài...</strong></div></div>
  if (!resumeReady) return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang khôi phục đáp án đã lưu...</strong></div></div>
  if (error) return <div className="exam-live-page"><div className="exam-live-state error"><Icon>error</Icon><strong>{error}</strong><button type="button" onClick={() => window.location.reload()}>Thử lại</button></div></div>
  if (!exam || !activePart) return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang chuẩn bị bài thi...</strong></div></div>
  if (!positionReady) return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang khôi phục vị trí làm bài...</strong></div></div>

  const range = questionGroup?.range
  const toeflHeaderNumber = isCompleteWordsGroup
    ? `${range?.from}${range?.to > range?.from ? `–${range.to}` : ''}`
    : questionGroup?.questions?.[readingSubIndex]?.number || range?.from
  const listeningHeaderNumber = toeflListeningPhase === 'answer'
    ? questionGroup?.questions?.[listeningSubIndex]?.number || range?.from
    : `${range?.from}${range?.to > range?.from ? `–${range.to}` : ''}`
  const headerTitle = phase === 'question' && range
    ? `${activePart.sectionTitle}: ${isToeflReading ? 'Question' : 'Câu hỏi'} ${isToeflReading ? toeflHeaderNumber : isToeflListening ? listeningHeaderNumber : `${range.from}${range.to > range.from ? `–${range.to}` : ''}`} ${isToeflReading ? 'of' : '/'} ${exam.questionCount}`
    : 'ONLINE TEST SYSTEM'

  const showListeningQuestionTimer = isToeflListening && phase === 'question' && toeflListeningPhase === 'answer'
  const listeningTimerUrgent = showListeningQuestionTimer && questionRemainingSeconds > 0 && questionRemainingSeconds <= 5

  return <div className={`exam-live-page ${isToeflReading ? 'toefl-reading-exam' : ''} ${isToeflListening ? 'toefl-listening-exam' : ''}`}>
    <header className="exam-live-header">
      <a href={`/exams/${examId}`} aria-label="IIG Việt Nam"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
      <strong>{headerTitle}</strong>
      <div className="exam-live-metrics">
        {(requiresAudio || isToeflReading) && <span className="audio"><Icon>{audioState === 'playing' ? 'volume_up' : 'volume_off'}</Icon></span>}
        <span><Icon>checklist</Icon>{answeredIds.size}/{exam.questionCount}</span>
        <span className={listeningTimerUrgent ? 'timer urgent' : 'timer'}><Icon>timer</Icon>{formatClock(showListeningQuestionTimer ? questionRemainingSeconds : remainingSeconds)}</span>
        <button type="button" disabled={submitting} onClick={() => submitAttempt()}>{submitting ? 'Đang nộp...' : 'Nộp bài'}</button>
      </div>
    </header>

    {phase === 'introduction' && <main className="part-intro-main"><section className="part-intro-card">
      <header><span><Icon>arrow_circle_right</Icon>{activePart.title || `Part ${partIndex + 1}`}</span><small>{activePart.sectionTitle}</small></header>
      <div className="part-intro-body">
        {introHtml ? <div className="part-intro-rich" dangerouslySetInnerHTML={{ __html: introHtml }} /> : <p>Đọc kỹ hướng dẫn của phần thi trước khi bắt đầu.</p>}
        {requiresAudio ? <div className={`part-intro-audio ${audioState}`}>
          <span className="part-intro-wave" aria-hidden="true">{Array.from({ length: 13 }, (_, index) => <i key={index} />)}</span>
          {audioState === 'playing' && <strong>Đang phát hướng dẫn…</strong>}
          {audioState === 'loading' && <strong>Đang tải audio hướng dẫn…</strong>}
          {audioState === 'blocked' && <><strong>Trình duyệt đang chặn tự động phát.</strong><button type="button" onClick={playIntroduction}><Icon>play_arrow</Icon>Phát hướng dẫn</button></>}
          {audioState === 'error' && <><strong>Không thể phát audio hướng dẫn.</strong><button type="button" onClick={playIntroduction}><Icon>refresh</Icon>Thử lại</button><button type="button" onClick={startPart}>Tiếp tục vào Part</button></>}
          {audioState === 'missing' && <><strong>Part này chưa có audio hướng dẫn.</strong><button type="button" onClick={startPart}>Tiếp tục vào Part</button></>}
        </div> : <button className="part-intro-continue" type="button" onClick={startPart}>Tiếp tục <Icon>arrow_forward</Icon></button>}
      </div>
    </section></main>}

    {phase === 'question' && <main className={`listening-question-main ${isFreestyle ? 'freestyle-question-main' : ''}`}>
      {!questionGroup ? <div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang tải câu hỏi...</strong></div> : <div className={`listening-question-layout ${isFreestyle ? 'freestyle-question-layout' : ''} ${locked ? 'locked' : ''}`}>
        <nav className="question-mobile-tabs" aria-label="Nội dung câu hỏi"><button type="button" className={mobilePane === 'content' ? 'active' : ''} onClick={() => setMobilePane('content')}><Icon>article</Icon>Nội dung</button><button type="button" className={mobilePane === 'questions' ? 'active' : ''} onClick={() => setMobilePane('questions')}><Icon>quiz</Icon>Câu hỏi</button></nav>
        <section className={`listening-content-pane ${mobilePane === 'content' ? 'mobile-active' : ''}`}>
          {questionGroup.content?.title && <h1>{questionGroup.content.title}</h1>}
          {questionGroup.content?.html && <div className="listening-content-html" dangerouslySetInnerHTML={{ __html: safeHtml(questionGroup.content.html) }} />}
          {questionGroup.content?.imageUrl && <img className="listening-content-image" src={questionGroup.content.imageUrl} alt={questionGroup.content.title || 'Nội dung câu hỏi'} />}
          {isToeflListening && toeflListeningPhase === 'audio' && <div className={`listening-playback-indicator ${audioState}`} role="status" aria-label={audioState === 'playing' ? 'Đang phát audio' : 'Đang chuẩn bị audio'}>
            <span aria-hidden="true">{Array.from({ length: 39 }, (_, index) => <i key={index} />)}</span>
          </div>}
          {questionGroup.content?.videoUrl && <video src={questionGroup.content.videoUrl} controls playsInline />}
        </section>
        <section className={`listening-questions-pane ${mobilePane === 'questions' ? 'mobile-active' : ''}`}>
          {(!isToeflListening || toeflListeningPhase === 'answer') && <h2>{isToeflReading ? 'Question' : 'Câu hỏi'}</h2>}
          {isToeflListening && toeflListeningPhase !== 'answer' ? null : isCompleteWordsGroup ? <article className="complete-words-candidate">
            <p className="complete-words-instruction">Fill in the missing letters in the paragraph.</p>
            <div className="complete-words-stem">{renderCompleteWordsStem(questionGroup.questions[0].stemHtml, questionGroup.questions, changeTextAnswer, persistTextAnswer, locked)}</div>
          </article> : isToeflListening ? <ToeflListeningMcq question={questionGroup.questions[listeningSubIndex]} locked={locked} onChoose={chooseOption} promptHtml={displayPromptHtml} optionText={displayOptionText} />
            : isToeflReading ? <ToeflReadingMcq questions={questionGroup.questions} index={readingSubIndex} locked={locked} onChoose={chooseOption} promptHtml={displayPromptHtml} optionText={displayOptionText} />
              : <LegacyMcqQuestionGroup questions={questionGroup.questions} locked={locked} onChoose={chooseOption} promptHtml={displayPromptHtml} optionText={displayOptionText} />}
          {saveError && <p className="listening-save-error"><Icon>error</Icon>{saveError}</p>}
        </section>
        {(audioState === 'blocked' || audioState === 'error') && <div className="listening-audio-overlay">
          <Icon>volume_off</Icon><strong>{audioState === 'blocked' ? 'Trình duyệt cần cho phép phát âm thanh.' : 'Audio bị gián đoạn hoặc không thể tiếp tục phát.'}</strong>
          <button type="button" onClick={() => playQuestionAudio({ manual: true })}><Icon>refresh</Icon>Thử lại</button>
        </div>}
        {isFreestyle && <>
          <button className="question-navigator-toggle" type="button" onClick={() => setNavigatorOpen(value => !value)} aria-label="Mở danh sách câu hỏi"><Icon>{navigatorOpen ? 'chevron_right' : 'chevron_left'}</Icon></button>
          <aside className={`question-navigator ${navigatorOpen ? 'open' : ''}`}>
            <header><Icon>menu_book</Icon><strong>{activePart.sectionTitle}</strong><button className="question-navigator-collapse" type="button" onClick={() => setNavigatorOpen(false)} aria-label="Thu gọn danh sách câu hỏi" title="Thu gọn"><Icon>keyboard_double_arrow_right</Icon></button></header>
            <h3>{activePart.title}</h3>
            <div className="question-number-grid">{partQuestionList.map(question => {
              const targetIndex = groupList.findIndex(group => group.id === question.parentQuestionId)
              const current = targetIndex === groupIndex && (!isToeflReading || question.id === questionGroup?.questions?.[readingSubIndex]?.id)
              const marked = markedIds.has(question.id)
              const answered = answeredIds.has(question.id)
              return <button type="button" key={question.id} className={`${current ? 'current' : ''} ${answered ? 'answered' : ''} ${marked ? 'marked' : ''}`} onClick={() => isToeflReading ? openFreestyleQuestion(targetIndex, question.id) : openFreestyleGroup(targetIndex)}>{question.number}</button>
            })}</div>
            <div className="question-navigator-legend"><span><i />Chưa trả lời</span><span className="answered"><i />Đã trả lời</span><span className="marked"><i />Đánh dấu</span></div>
          </aside>
          <footer className="freestyle-question-footer">
            <label className="freestyle-group-mark"><input type="checkbox" checked={isToeflReading && !isCompleteWordsGroup ? markedIds.has(questionGroup.questions?.[readingSubIndex]?.id) : (questionGroup.questions || []).length > 0 && questionGroup.questions.every(question => markedIds.has(question.id))} onChange={toggleCurrentGroupMark} /><span>{isToeflReading ? 'Mark item for review' : 'Đánh dấu để xem lại'}</span></label>
            <div className="freestyle-footer-actions">
              <button type="button" disabled={locked || ((!isToeflReading || !isCompleteWordsGroup) && readingSubIndex === 0 && groupIndex === 0 && previousFreestylePartIndex < 0) || (isCompleteWordsGroup && groupIndex === 0 && previousFreestylePartIndex < 0)} onClick={() => isToeflReading&&!isCompleteWordsGroup&&readingSubIndex>0?setReadingSubIndex(index=>index-1):groupIndex > 0 ? openFreestyleGroup(groupIndex - 1) : openPreviousFreestylePart()}>{!isToeflReading && <Icon>arrow_back</Icon>}{isToeflReading ? 'Back' : 'Quay lại'}</button>
              <button type="button" disabled={locked || ((!isToeflReading || !isCompleteWordsGroup) && readingSubIndex >= (questionGroup?.questions?.length||1)-1 && groupIndex >= groupList.length - 1 && nextFreestyleTransitionIndex < 0) || (isCompleteWordsGroup && groupIndex >= groupList.length - 1 && nextFreestyleTransitionIndex < 0)} onClick={() => isToeflReading&&!isCompleteWordsGroup&&readingSubIndex<(questionGroup?.questions?.length||1)-1?setReadingSubIndex(index=>index+1):groupIndex < groupList.length - 1 ? openFreestyleGroup(groupIndex + 1) : openNextPartIntro()}>{isToeflReading ? 'Next' : 'Tiếp theo'}{!isToeflReading && <Icon>arrow_forward</Icon>}</button>
            </div>
          </footer>
        </>}
        {isToeflListening && toeflListeningPhase === 'answer' && <footer className="toefl-listening-footer">
          <button type="button" disabled={locked} onClick={advanceToeflSubQuestion}>Next</button>
        </footer>}
      </div>}
    </main>}

    {phase === 'session-required' && <main className="part-intro-main"><section className="question-transition-card"><Icon>lock</Icon><strong>Chưa có phiên làm bài hợp lệ.</strong><small>Cần bắt đầu attempt từ kỳ thi trước khi tải câu hỏi.</small></section></main>}
    {phase === 'unsupported-question-mode' && <main className="part-intro-main"><section className="question-transition-card"><Icon>construction</Icon><strong>Màn câu hỏi {activePart.sectionTitle} sẽ được triển khai ở bước tiếp theo.</strong></section></main>}
    {phase === 'completed' && <main className="part-intro-main"><section className="question-transition-card"><Icon>task_alt</Icon><strong>Đã hoàn thành toàn bộ câu hỏi.</strong></section></main>}
    {timeExpired && <div className="exam-timeout-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="exam-timeout-title">
      <section className="exam-timeout-dialog"><span><Icon>timer_off</Icon></span><h2 id="exam-timeout-title">Đã hết thời gian làm bài</h2><p>Thời gian làm bài đã kết thúc. Vui lòng nộp bài để hoàn tất.</p>{saveError && <small>{saveError}</small>}<button type="button" disabled={submitting} onClick={() => submitAttempt({ skipConfirmation: true })}>{submitting ? 'Đang nộp bài…' : 'Nộp bài'}</button></section>
    </div>}
  </div>
}

export default ExamTestPage
