const { validateEnv } = require('../../config/env');
const { runtimeLog } = require('./runtimeLog');

function runtimePort(envName, env = process.env) {
  const configuredPort = env[envName] || env.PORT || '5000';
  return validateEnv({ ...env, PORT: configuredPort }).port;
}

function listen(app, port, serviceName) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      runtimeLog(serviceName, 'runtime_started', { port });
      resolve(server);
    });
    server.once('error', reject);
  });
}

function installShutdown({ serviceName, close, processRef = process }) {
  let closing = false;
  const shutdown = async signal => {
    if (closing) return;
    closing = true;
    runtimeLog(serviceName, 'runtime_stopping', { signal });
    try {
      await close();
      runtimeLog(serviceName, 'runtime_stopped', { signal });
      processRef.exit(0);
    } catch (error) {
      runtimeLog(serviceName, 'runtime_shutdown_failed', { signal, error: error.message }, 'error');
      processRef.exit(1);
    }
  };
  processRef.once('SIGTERM', () => shutdown('SIGTERM'));
  processRef.once('SIGINT', () => shutdown('SIGINT'));
  return shutdown;
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

module.exports = { runtimePort, listen, installShutdown, closeServer };
