const path = require('path');

const DEFAULT_DEV_JWT_SECRET = 'change-me-to-a-long-random-secret';

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
}

function splitCsv(value) {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isWeakAdminPassword(password) {
  if (typeof password !== 'string') return true;
  const normalized = password.trim();
  return normalized.length < 10 || normalized === 'Admin@1234' || normalized === 'change-this-password';
}

function createConfig({ rootDir }) {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  return {
    rootDir,
    port: Number.parseInt(process.env.PORT || '3000', 10) || 3000,
    nodeEnv,
    isProduction,
    jwtSecret: process.env.JWT_SECRET || '',
    corsOrigins: splitCsv(process.env.CORS_ORIGIN),
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number.parseInt(process.env.SMTP_PORT || '587', 10) || 587,
      secure: parseBoolean(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || '"Sacred Hearth CMS" <noreply@example.com>'
    },
    admin: {
      name: process.env.ADMIN_NAME || 'Parish Administrator',
      email: process.env.ADMIN_EMAIL || '',
      password: process.env.ADMIN_PASSWORD || ''
    },
    paths: {
      jsDir: path.join(rootDir, 'js'),
      publicDir: path.join(rootDir, 'public'),
      srcDir: path.join(rootDir, 'src'),
      uploadsDir: path.join(rootDir, 'uploads')
    }
  };
}

function validateConfig(config) {
  const errors = [];
  const warnings = [];

  if (!config.jwtSecret) {
    errors.push('JWT_SECRET is not set.');
  }

  if (config.isProduction && config.jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters in production.');
  }

  if (config.isProduction && config.jwtSecret === DEFAULT_DEV_JWT_SECRET) {
    errors.push('JWT_SECRET is still set to the development placeholder.');
  }

  if (config.admin.email && isWeakAdminPassword(config.admin.password)) {
    const message = 'ADMIN_PASSWORD looks weak or still uses a placeholder value.';
    if (config.isProduction) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  return { errors, warnings };
}

module.exports = {
  DEFAULT_DEV_JWT_SECRET,
  createConfig,
  validateConfig
};
