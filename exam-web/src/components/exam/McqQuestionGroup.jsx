function McqQuestion({ question, locked, onChoose, promptHtml, optionText, before, after }) {
  return <article id={`question-${question.id}`}>
    {before}
    <div className="listening-prompt"><b>{question.number}.</b><span dangerouslySetInnerHTML={{ __html: promptHtml(question.promptHtml) }} /></div>
    <div className="listening-options">{question.options.map(option => <label className={question.selectedOption === option.key ? 'selected' : ''} key={option.id || option.key}>
      <input type="radio" name={question.id} value={option.key} checked={question.selectedOption === option.key} disabled={locked} onChange={() => onChoose(question.id, option.key)} />
      <span><b>{option.key}.</b> {optionText(option.text, option.key)}</span>
    </label>)}</div>
    {after}
  </article>
}

export function LegacyMcqQuestionGroup({ questions, locked, onChoose, promptHtml, optionText }) {
  return <div className="listening-subquestions">{questions.slice().sort((a, b) => a.sortOrder - b.sortOrder).map(question => <McqQuestion
    key={question.id}
    question={question}
    locked={locked}
    onChoose={onChoose}
    promptHtml={promptHtml}
    optionText={optionText}
  />)}</div>
}

export function ToeflReadingMcq({ questions, index, locked, onChoose, promptHtml, optionText }) {
  const question = questions[index]
  if (!question) return null
  return <div className="listening-subquestions toefl-reading-subquestion"><McqQuestion
    question={question}
    locked={locked}
    onChoose={onChoose}
    promptHtml={promptHtml}
    optionText={optionText}
  /></div>
}

export function ToeflListeningMcq({ question, locked, onChoose, promptHtml, optionText }) {
  if (!question) return null
  return <div className="listening-subquestions"><McqQuestion
    question={question}
    locked={locked}
    onChoose={onChoose}
    promptHtml={promptHtml}
    optionText={optionText}
  /></div>
}
