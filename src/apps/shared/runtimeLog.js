const { getBuildInfo } = require('../../config/buildInfo');

function runtimeLog(service, event, details = {}, level = 'info', env = process.env) {
  const build = getBuildInfo(env);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service,
    environment: build.environment,
    version: build.version,
    commit: build.commit,
    ...details,
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  return entry;
}

module.exports = { runtimeLog };
