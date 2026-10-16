/**
 * IRONMAN TOSS BOOK - Authentication & Authorization Middleware
 * Enforces token verification and role-based access control.
 */

const { verifyToken } = require('../utils/crypto');

/**
 * Middleware: Verify Bearer authentication token
 */
function authenticate(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-access-token']) {
    token = req.headers['x-access-token'];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token required. Please sign in to access this resource.'
      }
    });
  }

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.userId !== undefined ? payload.userId : payload.id,
      uuid: payload.uuid,
      username: payload.username || (payload.id ? `admin_${payload.id}` : 'admin'),
      email: payload.email,
      role: payload.role || 'user'
    };
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: err.message || 'Authentication token is invalid or has expired.'
      }
    });
  }
}

/**
 * Middleware: Role-based authorization guard
 */
function requireRole(allowedRoles = []) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.'
        }
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You do not possess the required permissions.'
        }
      });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole
};
