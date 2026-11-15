// Compatibility entrypoint for local/PM2 installations. The only backend
// runtime owned by this repository is now the Admin API.
const startAdminServer = require('./apps/admin/server');

if (require.main === module) {
  startAdminServer().catch(error => {
    console.error('❌ Failed to start Admin API:', error);
    process.exit(1);
  });
}

module.exports = startAdminServer;
