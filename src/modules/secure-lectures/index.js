const errors = require('./errors');
const config = require('./config');
const services = require('./services');
const stores = require('./stores');

module.exports = { services, errors, config, stores, ...errors };
