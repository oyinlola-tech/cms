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

  const server = app.listen(config.port, () => {
    console.log(`\nServer running at http://localhost:${config.port}`);
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Health check: http://localhost:${config.port}/health`);
    if (!config.isProduction) {
      console.log('OTP codes will be shown in console (no real emails sent).');
      console.log(`Admin login: ${config.admin.email}`);
    }
  });

  // Graceful shutdown handler
  let isShuttingDown = false;
  
  async function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log(`\n${signal} received. Starting graceful shutdown...`);
    
    // Stop accepting new connections
    server.close(() => {
      console.log('HTTP server closed.');
      
      // Close database pool
      if (db && typeof db.end === 'function') {
        db.end((err) => {
          if (err) {
            console.error('Error closing database pool:', err);
          } else {
            console.log('Database pool closed.');
          }
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
    
    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 30000);
  }

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  
  // Handle uncaught errors
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  });

  return server;
}

module.exports = { startServer };
