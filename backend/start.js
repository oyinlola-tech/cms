require('dotenv').config();

const path = require('path');
const { initializeDatabase } = require('../db-init');
const { createConfig, validateConfig } = require('./config/env');
const { createApp } = require('./app');

async function startServer() {
  const rootDir = path.resolve(__dirname, '..');
  const config = createConfig({ rootDir });
  const validation = validateConfig(config);

  for (const warning of validation.warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  if (validation.errors.length > 0) {
    for (const error of validation.errors) {
      console.error(`Startup failed: ${error}`);
    }
    process.exit(1);
  }

  const db = await initializeDatabase();
  const { app } = createApp({ config, db });

  return new Promise((resolve) => {
    const server = app.listen(config.port, () => {
      console.log(`\nServer running at http://localhost:${config.port}`);
      console.log(`Environment: ${config.nodeEnv}`);
      if (!config.isProduction) {
        console.log('OTP codes will be shown in console (no real emails sent).');
        console.log(`Admin login: ${config.admin.email}`);
      }
      resolve(server);
    });
  });
}

module.exports = { startServer };
