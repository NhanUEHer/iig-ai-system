export function getNextFreestyleTransitionIndex(parts, currentIndex, isToeflReading) {
  const nextIndex = currentIndex + 1
  const currentPart = parts[currentIndex]
  const nextPart = parts[nextIndex]
  if (!nextPart) return -1
  if (isToeflReading) return nextIndex
  return nextPart.examMode === 'FREESTYLE' && nextPart.sectionId === currentPart?.sectionId
    ? nextIndex
    : -1
}

export function shouldPauseBetweenListeningGroups({
  isToeflListening,
  hasNextQuestionGroup,
  isLastSubQuestion,
  breakDurationSeconds,
}) {
  return Boolean(
    isToeflListening
    && hasNextQuestionGroup
    && isLastSubQuestion
    && Number(breakDurationSeconds) > 0,
  )
}
