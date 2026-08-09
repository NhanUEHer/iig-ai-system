const packageJson = require('../../package.json');

function getBuildInfo(env = process.env) {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : 'development';
  const environment = env.APP_ENV || nodeEnv;
  return {
    environment,
    label: environment === 'production' ? 'Production' : 'Dev',
    version: env.APP_VERSION || packageJson.version,
    commit: env.APP_COMMIT || null
  };
}

module.exports = { getBuildInfo };
