const { getPool } = require('../config/db');
const { verifyToken } = require('../utils/crypto');

/**
 * Middleware: Verify Bearer authentication token and attach authoritative user state from MySQL
 */
async function authenticate(req, res, next) {
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
    const userId = payload.userId !== undefined ? payload.userId : payload.id;

    // Authoritative real-time check from MySQL users table
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, uuid, username, email, role, status, must_change_password FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found.'
        }
      });
    }

    const dbUser = rows[0];

    // If account is suspended or banned, reject immediately
    if (dbUser.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: dbUser.status === 'banned' ? 'USER_BANNED' : 'USER_SUSPENDED',
          message: `Your account is ${dbUser.status}. Access denied.`
        }
      });
    }

    req.user = {
      id: dbUser.id,
      uuid: dbUser.uuid,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role || 'user',
      status: dbUser.status || 'active',
      mustChangePassword: Boolean(dbUser.must_change_password),
      must_change_password: Boolean(dbUser.must_change_password)
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

/**
 * Middleware: Enforce that user has changed temporary password before accessing platform features
 */
function enforcePasswordChange(req, res, next) {
  if (req.user && req.user.mustChangePassword) {
    return res.status(403).json({
      success: false,
      code: 'PASSWORD_CHANGE_REQUIRED',
      mustChangePassword: true,
      error: {
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'You must change your temporary password before accessing platform features.'
      }
    });
  }
  next();
}

module.exports = {
  authenticate,
  requireRole,
  enforcePasswordChange
};
