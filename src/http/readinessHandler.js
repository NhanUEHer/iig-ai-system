function createReadinessHandler(database, timeoutMs = 2000) {
  return async (req, res) => {
    const ready = await database.isReady(timeoutMs);
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'unavailable' });
  };
}

module.exports = { createReadinessHandler };
