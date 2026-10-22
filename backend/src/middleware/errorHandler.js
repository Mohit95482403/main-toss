/**
 * IRONMAN TOSS BOOK - Centralized Error Handling Middleware
 */

/**
 * 404 Not Found Handler for unmatched routes
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.originalUrl} not found on this server.`
    }
  });
}

/**
 * Central Error Handler
 * Sanitizes errors and prevents internal stack trace leaks
 */
function centralErrorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';
  const correlationId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || `req-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Log full error details and stack trace internally for server diagnostics
  console.error(`[ERROR] [${correlationId}] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}:`, err.message);
  if (err.stack) {
    console.error(`[STACK TRACE] [${correlationId}]:\n`, err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
      message: statusCode === 500 && isProduction
        ? 'An unexpected internal server error occurred.'
        : err.message || 'Unknown server error',
      ...(!isProduction && err.details ? { details: err.details } : {})
    }
  });
}

module.exports = {
  notFoundHandler,
  centralErrorHandler
};
