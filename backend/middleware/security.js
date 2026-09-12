const cors = require('cors');

function applySecurityMiddleware(app, config) {
  const allowAllOrigins = config.corsOrigins.length === 0;

  app.use(cors({
    origin(origin, callback) {
      // Same-origin and non-browser callers send no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }

      // Reflecting every origin is only tolerable outside production;
      // validateConfig turns an empty allow-list into a startup error there.
      if (allowAllOrigins && !config.isProduction) {
        callback(null, true);
        return;
      }

      callback(null, config.corsOrigins.includes(origin));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 86400
  }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Origin-Agent-Cluster', '?1');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // Inline <script> blocks were removed from the HTML in favour of external
    // page-init modules, so script-src no longer needs 'unsafe-inline'.
    // Tailwind's CDN build injects styles at runtime, which still requires
    // 'unsafe-inline' for style-src only.
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' https://cdn.tailwindcss.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "upgrade-insecure-requests"
    ].join('; '));

    if (config.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  });
}

module.exports = { applySecurityMiddleware };
