export const buildInfo = Object.freeze({
  environment: __APP_ENVIRONMENT__,
  label: __APP_ENVIRONMENT__ === 'production' ? 'Production' : __APP_ENVIRONMENT__ === 'beta' ? 'Beta' : 'Dev',
  version: __APP_VERSION__,
  commit: __APP_COMMIT__ || null
});
