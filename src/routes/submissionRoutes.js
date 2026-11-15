const express = require('express');

const syncRoutes = require('./submissions/syncRoutes');
const mappingRoutes = require('./submissions/mappingRoutes');
const exportRoutes = require('./submissions/exportRoutes');
const coreRoutes = require('./submissions/coreRoutes');

const router = express.Router();

// Specific routes must be mounted before the /:id routes in coreRoutes.
router.use(syncRoutes);
router.use(mappingRoutes);
router.use(exportRoutes);
router.use(coreRoutes);

module.exports = router;
