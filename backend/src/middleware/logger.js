/**
 * IRONMAN TOSS BOOK - Safe Request Logger Middleware
 * Logs incoming HTTP requests with timing, method, and status without exposing credentials or bodies.
 */

function requestLogger(req, res, next) {
  const startTime = Date.now();
  const { method, originalUrl } = req;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const timestamp = new Date().toISOString();

    // Avoid logging noisy asset or favicon requests
    if (originalUrl === '/favicon.ico') return;

    console.log(`[${timestamp}] ${method} ${originalUrl} ${statusCode} - ${duration}ms [IP: ${clientIp}]`);
  });

  next();
}

module.exports = requestLogger;
