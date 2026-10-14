/**
 * IRONMAN TOSS BOOK - HTTP Security Headers Middleware
 * Protects against MIME sniffing, clickjacking, and information disclosure.
 */

function securityHeaders(req, res, next) {
  // Prevent MIME-type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Clickjacking protection
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Cross-site scripting filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable sensitive hardware features
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Strip server banner header
  res.removeHeader('X-Powered-By');

  next();
}

module.exports = securityHeaders;
