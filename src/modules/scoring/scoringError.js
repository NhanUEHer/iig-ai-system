class ScoringError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'ScoringError';
    this.statusCode = statusCode;
  }
}

module.exports = ScoringError;

