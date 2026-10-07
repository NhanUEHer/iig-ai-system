import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAttemptPartQuestions, getAttemptQuestionGroup, getPublicExamDetail, resumeExamAttempt, saveAttemptAnswer, submitExamAttempt } from '../services/publicExamApi'
import { acquireExamAttemptTab } from '../services/examAttemptTabLock'

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
  const [submitting, setSubmitting] = useState(false)
  const [timeExpired, setTimeExpired] = useState(() => Boolean(sessionExpiry && sessionExpiry <= Date.now()))
  const [positionReady, setPositionReady] = useState(false)
  const [tabAccess, setTabAccess] = useState(() => session ? 'checking' : 'acquired')
  const [resumeReady, setResumeReady] = useState(() => !session)
  const audioRef = useRef(null)
  const playbackRunRef = useRef(0)
  const pendingSavesRef = useRef(new Map())
  const failedSavesRef = useRef(new Set())
  const latestAnswersRef = useRef(new Map())
  const resumeAttemptedRef = useRef(false)

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
  const requiresAudio = AUTO_AUDIO_MODES.has(activePart?.examMode)
  const isFreestyle = activePart?.examMode === 'FREESTYLE'
  const introHtml = useMemo(() => safeHtml(activePart?.instructionHtml), [activePart?.instructionHtml])

  useEffect(() => {
    if (!session?.attemptId) return
    setMarkedIds(readMarkedQuestions(examId, session.attemptId))
  }, [examId, session?.attemptId])

  const stopAudio = useCallback(() => {
    playbackRunRef.current += 1
    audioRef.current?.pause()
    audioRef.current = null
  }, [])

  const loadQuestionGroup = useCallback(async (groups, index, partId) => {
    if (!session || !groups[index]) return
    setLocked(true)
    setQuestionGroup(null)
    setMobilePane('content')
    setAudioState('loading')
    const result = await getAttemptQuestionGroup({ ...session, parentQuestionId: groups[index].id })
    setRemainingSeconds(result.data.attempt.remainingSeconds)
    setQuestionGroup(result.data.questionGroup)
    writeAttemptPosition(examId, session.attemptId, partId, groups[index].id)
    setAnsweredIds(current => {
      const next = new Set(current)
      result.data.questionGroup.questions.forEach(question => { if (question.selectedOption) next.add(question.id) })
      return next
    })
    setLocked(false)
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
      await loadQuestionGroup(groups, targetGroupIndex, position.partId)
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
      await loadQuestionGroup(groups, 0, activePart.id)
    } catch (requestError) {
      setError(requestError.message)
      setLocked(false)
    }
  }, [activePart, loadQuestionGroup, session, stopAudio, timeExpired])

  const playIntroduction = useCallback(async () => {
    const url = activePart?.instructionAudio?.url
    if (!url) { setAudioState('missing'); return }
    stopAudio()
    const audio = new Audio(url)
    audio.preload = 'auto'
    audio.addEventListener('ended', startPart, { once: true })
    audio.addEventListener('error', () => setAudioState('error'), { once: true })
    audioRef.current = audio
    setAudioState('loading')
    try { await audio.play(); setAudioState('playing') } catch { setAudioState('blocked') }
  }, [activePart, startPart, stopAudio])

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
      await loadQuestionGroup(groupList, nextIndex, activePart.id).catch(requestError => setError(requestError.message))
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
  }, [activePart?.id, examId, groupIndex, groupList, loadQuestionGroup, partIndex, parts, session?.attemptId, stopAudio])

  const playQuestionAudio = useCallback(async ({ manual = false } = {}) => {
    const url = questionGroup?.content?.audioUrl
    if (!url) { setAudioState('error'); return }
    stopAudio()
    const runId = playbackRunRef.current
    setAudioState('loading')
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (runId !== playbackRunRef.current) return
      const audio = new Audio(url)
      audio.preload = 'auto'
      audioRef.current = audio
      try {
        await new Promise((resolve, reject) => {
          audio.addEventListener('ended', resolve, { once: true })
          audio.addEventListener('error', reject, { once: true })
          audio.play().then(() => setAudioState('playing')).catch(reject)
        })
        if (runId !== playbackRunRef.current) return
        setAudioState('break')
        await wait(Number(questionGroup.breakDurationSeconds || 0) * 1000)
        if (runId === playbackRunRef.current) await advanceQuestion()
        return
      } catch (playbackError) {
        audio.pause()
        if (!manual && playbackError?.name === 'NotAllowedError') { setAudioState('blocked'); return }
        if (attempt < 2) await wait((attempt + 1) * 1000)
      }
    }
    if (runId === playbackRunRef.current) setAudioState('error')
  }, [advanceQuestion, questionGroup, stopAudio])

  useEffect(() => {
    if (phase !== 'question' || !questionGroup || !requiresAudio) return undefined
    playQuestionAudio()
    return stopAudio
  }, [phase, questionGroup?.id, playQuestionAudio, requiresAudio, stopAudio])

  const openFreestyleGroup = useCallback(async index => {
    if (!isFreestyle || locked || !groupList[index]) return
    setLocked(true)
    setSaveError('')
    try {
      await Promise.allSettled([...pendingSavesRef.current.values()])
      setGroupIndex(index)
      await loadQuestionGroup(groupList, index, activePart.id)
      setNavigatorOpen(false)
    } catch (requestError) {
      setSaveError(requestError.message)
      setLocked(false)
    }
  }, [activePart?.id, groupList, isFreestyle, loadQuestionGroup, locked])

  const previousFreestylePartIndex = partIndex > 0
    && parts[partIndex - 1]?.examMode === 'FREESTYLE'
    && parts[partIndex - 1]?.sectionId === activePart?.sectionId ? partIndex - 1 : -1
  const nextFreestylePartIndex = parts[partIndex + 1]?.examMode === 'FREESTYLE'
    && parts[partIndex + 1]?.sectionId === activePart?.sectionId ? partIndex + 1 : -1

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
      await loadQuestionGroup(groups, groups.length - 1, targetPart.id)
    } catch (requestError) {
      setSaveError(requestError.message)
      setLocked(false)
    }
  }, [loadQuestionGroup, locked, parts, previousFreestylePartIndex, session])

  const openNextFreestylePartIntro = useCallback(async () => {
    if (nextFreestylePartIndex < 0 || locked) return
    await Promise.allSettled([...pendingSavesRef.current.values()])
    setPartIndex(nextFreestylePartIndex)
    writeAttemptPosition(examId, session?.attemptId, parts[nextFreestylePartIndex].id, null, 'introduction')
    setGroupList([])
    setPartQuestionList([])
    setQuestionGroup(null)
    setGroupIndex(0)
    setNavigatorOpen(false)
    setAudioState('idle')
    setPhase('introduction')
    setLocked(false)
  }, [examId, locked, nextFreestylePartIndex, parts, session?.attemptId])

  const toggleCurrentGroupMark = () => {
    if (!isFreestyle || !session?.attemptId) return
    const questionIds = (questionGroup?.questions || []).map(question => question.id)
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
    setSaveError('')
    setQuestionGroup(current => ({ ...current, questions: current.questions.map(question => question.id === questionId ? { ...question, selectedOption: optionKey } : question) }))
    setAnsweredIds(current => new Set(current).add(questionId))
    if (!session) return
    latestAnswersRef.current.set(questionId, optionKey)
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
          const optionKey = latestAnswersRef.current.get(questionId)
          if (!optionKey) return
          try {
            await saveAnswerWithRetry({ ...session, subQuestionId: questionId, selectedOptionKey: optionKey })
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

  useEffect(() => () => stopAudio(), [stopAudio])

  if (tabAccess === 'blocked') return <div className="exam-live-page"><div className="exam-live-state exam-tab-conflict"><span><Icon>tab_unselected</Icon></span><h1>Bài thi đang được mở ở tab khác</h1><p>Để bảo vệ tiến trình và đáp án, mỗi lượt thi chỉ được thao tác trên một tab. Hãy quay lại tab đang làm bài hoặc đóng tab đó trước khi thử lại.</p><div><button type="button" onClick={() => window.location.reload()}><Icon>refresh</Icon>Kiểm tra lại</button><a href={`/exams/${examId}`}>Quay về đề thi</a></div></div></div>
  if (tabAccess === 'checking') return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang kiểm tra phiên làm bài...</strong></div></div>
  if (!resumeReady) return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang khôi phục đáp án đã lưu...</strong></div></div>
  if (error) return <div className="exam-live-page"><div className="exam-live-state error"><Icon>error</Icon><strong>{error}</strong><button type="button" onClick={() => window.location.reload()}>Thử lại</button></div></div>
  if (!exam || !activePart) return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang chuẩn bị bài thi...</strong></div></div>
  if (!positionReady) return <div className="exam-live-page"><div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang khôi phục vị trí làm bài...</strong></div></div>

  const range = questionGroup?.range
  const headerTitle = phase === 'question' && range ? `${activePart.sectionTitle}: Câu hỏi ${range.from}${range.to > range.from ? `–${range.to}` : ''} / ${exam.questionCount}` : 'ONLINE TEST SYSTEM'

  return <div className="exam-live-page">
    <header className="exam-live-header">
      <a href={`/exams/${examId}`} aria-label="IIG Việt Nam"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
      <strong>{headerTitle}</strong>
      <div className="exam-live-metrics">
        {requiresAudio && <span className="audio"><Icon>{audioState === 'playing' ? 'volume_up' : 'volume_off'}</Icon></span>}
        <span><Icon>checklist</Icon>{answeredIds.size}/{exam.questionCount}</span>
        <span><Icon>timer</Icon>{formatClock(remainingSeconds)}</span>
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
          {audioState === 'error' && <><strong>Không thể phát audio hướng dẫn.</strong><button type="button" onClick={playIntroduction}><Icon>refresh</Icon>Thử lại</button></>}
          {audioState === 'missing' && <strong>Part này chưa có audio hướng dẫn. Vui lòng liên hệ bộ phận hỗ trợ.</strong>}
        </div> : <button className="part-intro-continue" type="button" onClick={startPart}>Tiếp tục <Icon>arrow_forward</Icon></button>}
      </div>
    </section></main>}

    {phase === 'question' && <main className={`listening-question-main ${isFreestyle ? 'freestyle-question-main' : ''}`}>
      {!questionGroup ? <div className="exam-live-state"><span className="catalog-spinner" /><strong>Đang tải câu hỏi...</strong></div> : <div className={`listening-question-layout ${isFreestyle ? 'freestyle-question-layout' : ''} ${locked ? 'locked' : ''}`}>
        <nav className="question-mobile-tabs" aria-label="Nội dung câu hỏi"><button type="button" className={mobilePane === 'content' ? 'active' : ''} onClick={() => setMobilePane('content')}><Icon>article</Icon>Nội dung</button><button type="button" className={mobilePane === 'questions' ? 'active' : ''} onClick={() => setMobilePane('questions')}><Icon>quiz</Icon>Câu hỏi</button></nav>
        <section className={`listening-content-pane ${mobilePane === 'content' ? 'mobile-active' : ''}`}>
          {questionGroup.content?.title && <h1>{questionGroup.content.title}</h1>}
          {questionGroup.content?.html && <div className="listening-content-html" dangerouslySetInnerHTML={{ __html: safeHtml(questionGroup.content.html) }} />}
          {questionGroup.content?.imageUrl && <img src={questionGroup.content.imageUrl} alt={questionGroup.content.title || 'Nội dung câu hỏi'} />}
          {questionGroup.content?.videoUrl && <video src={questionGroup.content.videoUrl} controls playsInline />}
        </section>
        <section className={`listening-questions-pane ${mobilePane === 'questions' ? 'mobile-active' : ''}`}>
          <h2>Câu hỏi</h2>
          <div className="listening-subquestions">{questionGroup.questions.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(question => <article id={`question-${question.id}`} key={question.id}>
            <div className="listening-prompt"><b>{question.number}.</b><span dangerouslySetInnerHTML={{ __html: displayPromptHtml(question.promptHtml) }} /></div>
            <div className="listening-options">{question.options.map(option => <label className={question.selectedOption === option.key ? 'selected' : ''} key={option.id || option.key}>
              <input type="radio" name={question.id} value={option.key} checked={question.selectedOption === option.key} disabled={locked} onChange={() => chooseOption(question.id, option.key)} />
              <span><b>{option.key}.</b> {displayOptionText(option.text, option.key)}</span>
            </label>)}</div>
          </article>)}</div>
          {saveError && <p className="listening-save-error"><Icon>error</Icon>{saveError}</p>}
        </section>
        {(audioState === 'blocked' || audioState === 'error') && <div className="listening-audio-overlay">
          <Icon>volume_off</Icon><strong>{audioState === 'blocked' ? 'Trình duyệt cần cho phép phát âm thanh.' : 'Không thể phát audio sau 3 lần thử.'}</strong>
          <button type="button" onClick={() => playQuestionAudio({ manual: true })}><Icon>refresh</Icon>Thử lại</button>
        </div>}
        {isFreestyle && <>
          <button className="question-navigator-toggle" type="button" onClick={() => setNavigatorOpen(value => !value)} aria-label="Mở danh sách câu hỏi"><Icon>{navigatorOpen ? 'chevron_right' : 'chevron_left'}</Icon></button>
          <aside className={`question-navigator ${navigatorOpen ? 'open' : ''}`}>
            <header><Icon>menu_book</Icon><strong>{activePart.sectionTitle}</strong><button className="question-navigator-collapse" type="button" onClick={() => setNavigatorOpen(false)} aria-label="Thu gọn danh sách câu hỏi" title="Thu gọn"><Icon>keyboard_double_arrow_right</Icon></button></header>
            <h3>{activePart.title}</h3>
            <div className="question-number-grid">{partQuestionList.map(question => {
              const targetIndex = groupList.findIndex(group => group.id === question.parentQuestionId)
              const current = targetIndex === groupIndex
              const marked = markedIds.has(question.id)
              const answered = answeredIds.has(question.id)
              return <button type="button" key={question.id} className={`${current ? 'current' : ''} ${answered ? 'answered' : ''} ${marked ? 'marked' : ''}`} onClick={() => openFreestyleGroup(targetIndex)}>{question.number}</button>
            })}</div>
            <div className="question-navigator-legend"><span><i />Chưa trả lời</span><span className="answered"><i />Đã trả lời</span><span className="marked"><i />Đánh dấu</span></div>
          </aside>
          <footer className="freestyle-question-footer">
            <label className="freestyle-group-mark"><input type="checkbox" checked={(questionGroup.questions || []).length > 0 && questionGroup.questions.every(question => markedIds.has(question.id))} onChange={toggleCurrentGroupMark} /><span>Đánh dấu để xem lại</span></label>
            <div className="freestyle-footer-actions">
              <button type="button" disabled={locked || (groupIndex === 0 && previousFreestylePartIndex < 0)} onClick={() => groupIndex > 0 ? openFreestyleGroup(groupIndex - 1) : openPreviousFreestylePart()}><Icon>arrow_back</Icon>Quay lại</button>
              <button type="button" disabled={locked || (groupIndex >= groupList.length - 1 && nextFreestylePartIndex < 0)} onClick={() => groupIndex < groupList.length - 1 ? openFreestyleGroup(groupIndex + 1) : openNextFreestylePartIntro()}>Tiếp theo<Icon>arrow_forward</Icon></button>
            </div>
          </footer>
        </>}
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
