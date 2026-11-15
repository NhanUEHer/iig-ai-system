// Release identity is provided at container start (runtime-config.js, written from APP_ENV /
// APP_VERSION / APP_COMMIT) so one image can be promoted from Beta to Production unchanged.
// Build-time constants remain the fallback for local development.
const runtime = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};
const environment = runtime.env || __APP_ENVIRONMENT__;

export const buildInfo = Object.freeze({
  environment,
  label: environment === 'production' ? 'Production' : environment === 'beta' ? 'Beta' : 'Dev',
  version: runtime.version || __APP_VERSION__,
  commit: runtime.commit || __APP_COMMIT__ || null
});
