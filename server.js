const { startServer } = require('./backend/start');

startServer().catch((error) => {
  console.error('Startup failed:', error);
  process.exit(1);
});
