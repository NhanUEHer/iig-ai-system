const express = require('express');
const cors = require('cors');
const requestContext = require('../../http/requestContext');
const { apiAccessLogger } = require('../../http/apiAccessLogger');
const errorHandler = require('../../http/errorHandler');
const HttpError = require('../../http/httpError');
const { getBuildInfo } = require('../../config/buildInfo');

function createHttpApp({ serviceName, mountRoutes, configure, readiness }) {
  if (!serviceName) throw new Error('serviceName is required.');
  if (typeof mountRoutes !== 'function') throw new Error('mountRoutes must be a function.');

  const app = express();
  app.locals.serviceName = serviceName;
  app.disable('x-powered-by');
  app.use(cors());
  app.use(requestContext);
  app.use(apiAccessLogger);
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  if (typeof configure === 'function') configure(app);
  mountRoutes(app);

  const health = (req, res) => res.json({
    status: 'ok',
    service: serviceName,
    time: new Date(),
    requestId: req.requestId,
    build: getBuildInfo(),
  });
  app.get('/health', health);
  app.get('/health/live', health);
  app.get('/health/ready', async (req, res, next) => {
    try {
      const result = typeof readiness === 'function'
        ? await readiness()
        : { ready: true, checks: {} };
      res.status(result.ready ? 200 : 503).json({
        status: result.ready ? 'ready' : 'not_ready',
        service: serviceName,
        time: new Date(),
        requestId: req.requestId,
        build: getBuildInfo(),
        checks: result.checks,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((req, res, next) => next(new HttpError('Route not found.', 404, 'ROUTE_NOT_FOUND')));
  app.use(errorHandler);
  return app;
}

module.exports = createHttpApp;
