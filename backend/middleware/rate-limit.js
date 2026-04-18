const DEFAULT_HEADERS = {
  limit: 'X-RateLimit-Limit',
  remaining: 'X-RateLimit-Remaining',
  reset: 'X-RateLimit-Reset'
};

function getClientIp(req) {
  if (typeof req.ip === 'string' && req.ip.trim()) {
    return req.ip.trim();
  }

  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const [first] = forwarded.split(',');
    return first.trim();
  }

  if (typeof req.socket?.remoteAddress === 'string') {
    return req.socket.remoteAddress;
  }

  return 'unknown';
}

function createRateLimiterStore() {
  return {
    buckets: new Map(),
    requestCount: 0
  };
}

function createRateLimit(store, options) {
  const {
    keyPrefix,
    windowMs,
    max,
    identifier = () => '',
    headers = DEFAULT_HEADERS
  } = options;

  return function rateLimitMiddleware(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();
    const extraKey = identifier(req);
    const key = `${keyPrefix}:${ip}:${extraKey}`;

    if (store.requestCount % 250 === 0) {
      for (const [bucketKey, bucket] of store.buckets.entries()) {
        if (bucket.resetAt <= now) {
          store.buckets.delete(bucketKey);
        }
      }
    }
    store.requestCount += 1;

    const bucket = store.buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    store.buckets.set(key, bucket);

    const remaining = Math.max(0, max - bucket.count);
    const resetInSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader(headers.limit, String(max));
    res.setHeader(headers.remaining, String(remaining));
    res.setHeader(headers.reset, String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(resetInSeconds));
      res.status(429).json({ message: 'Too many requests. Please try again later.' });
      return;
    }

    next();
  };
}

function createRateLimiters() {
  const store = createRateLimiterStore();

  return {
    api: createRateLimit(store, { keyPrefix: 'api', windowMs: 60_000, max: 300 }),
    staticFiles: createRateLimit(store, { keyPrefix: 'static-files', windowMs: 60_000, max: 200 }),
    login: createRateLimit(store, {
      keyPrefix: 'login',
      windowMs: 60_000,
      max: 10,
      identifier: (req) => String(req.body?.email || '').trim().toLowerCase()
    }),
    authRead: createRateLimit(store, { keyPrefix: 'auth-read', windowMs: 60_000, max: 60 }),
    forgotPassword: createRateLimit(store, {
      keyPrefix: 'forgot-password',
      windowMs: 10 * 60_000,
      max: 5,
      identifier: (req) => String(req.body?.email || '').trim().toLowerCase()
    }),
    otpVerify: createRateLimit(store, {
      keyPrefix: 'verify-otp',
      windowMs: 10 * 60_000,
      max: 10,
      identifier: (req) => String(req.body?.email || '').trim().toLowerCase()
    }),
    authWrite: createRateLimit(store, { keyPrefix: 'auth-write', windowMs: 5 * 60_000, max: 10 }),
    publicRead: createRateLimit(store, { keyPrefix: 'public-read', windowMs: 60_000, max: 200 }),
    publicWrite: createRateLimit(store, { keyPrefix: 'public-write', windowMs: 10 * 60_000, max: 10 }),
    dashboard: createRateLimit(store, { keyPrefix: 'dashboard', windowMs: 60_000, max: 60 }),
    adminRead: createRateLimit(store, { keyPrefix: 'admin-read', windowMs: 60_000, max: 120 }),
    adminWrite: createRateLimit(store, { keyPrefix: 'admin-write', windowMs: 60 * 60_000, max: 20 }),
    upload: createRateLimit(store, { keyPrefix: 'upload', windowMs: 60 * 60_000, max: 10 }),
    export: createRateLimit(store, { keyPrefix: 'export', windowMs: 60_000, max: 10 })
  };
}

module.exports = {
  createRateLimit,
  createRateLimiters
};
