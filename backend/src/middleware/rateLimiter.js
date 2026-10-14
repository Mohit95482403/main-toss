/**
 * IRONMAN TOSS BOOK - In-Memory Rate Limiter Middleware
 * Protects authentication endpoints from automated brute-force attacks.
 */

function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
  const maxAttempts = options.maxAttempts || 10;
  const message = options.message || 'Too many authentication attempts. Please try again later.';

  const attemptsMap = new Map();

  // Periodic garbage collection every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of attemptsMap.entries()) {
      if (now > record.resetTime) {
        attemptsMap.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref(); // unref prevents timer from holding Node event loop open during tests

  return function rateLimiter(req, res, next) {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${clientIp}:${req.path}`;
    const now = Date.now();

    let record = attemptsMap.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 1,
        resetTime: now + windowMs
      };
      attemptsMap.set(key, record);
      return next();
    }

    record.count++;

    if (record.count > maxAttempts) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
          retryAfter: retryAfterSec
        }
      });
    }

    next();
  };
}

module.exports = {
  createRateLimiter
};
