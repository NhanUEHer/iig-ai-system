function numeric(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundedAverage(values) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + numeric(value), 0) / values.length) : 0;
}

function presentAverage(metrics, names) {
  return roundedAverage(names.filter(name => metrics[name] !== null && metrics[name] !== undefined).map(name => metrics[name]));
}

function calculateFinalScore(answer, metrics) {
  const section = String(answer?.section || '').toLowerCase();
  const questionNo = Number.parseInt(answer?.question_no, 10);
  const suppliedScore = metrics.finalScore;

  if (section === 'speaking') {
    if (questionNo <= 2) {
      return roundedAverage([metrics.pronunciationScore, metrics.intonationScore]);
    }
    if (questionNo <= 4) {
      return roundedAverage([
        metrics.cohesionScore, metrics.grammarScore, metrics.intonationScore,
        metrics.pronunciationScore, metrics.vocabularyScore
      ]);
    }
    return roundedAverage([
      metrics.pronunciationScore, metrics.intonationScore, metrics.cohesionScore,
      metrics.grammarScore, metrics.vocabularyScore, metrics.completenessScore,
      metrics.relevanceScore
    ]);
  }

  if (suppliedScore !== null && suppliedScore !== undefined && suppliedScore !== '') {
    return suppliedScore;
  }
  if (section === 'writing' && questionNo <= 5) {
    return roundedAverage([metrics.grammarScore, metrics.relevanceScore, metrics.vocabularyScore]);
  }
  if (section === 'writing') {
    return presentAverage(metrics, ['grammarScore', 'relevanceScore', 'cohesionScore', 'vocabularyScore']);
  }
  return suppliedScore ?? null;
}

module.exports = { numeric, roundedAverage, calculateFinalScore };

