async function retry(_state, next) { return next(); }

module.exports = retry;
module.exports.retry = retry;
