/**
 * IRONMAN TOSS BOOK - Authentication Routes
 * Implements secure registration, login, logout, profile management, and password change.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { getPool } = require('../config/db');
const { hashPassword, verifyPassword, generateToken, verifyToken, sanitizeUser } = require('../utils/crypto');
const { authenticate, enforcePasswordChange } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');
const { createUserAccount } = require('../services/userService');

// Rate limiter for authentication attempts: 10 attempts per 15 minutes in production, higher in development/testing
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: process.env.NODE_ENV === 'production' ? 10 : 250,
  message: 'Too many authentication attempts from this IP address. Please try again in 15 minutes.'
});

/**
 * POST /api/auth/register
 * Admin-only account creation endpoint. Public self-registration is strictly disabled.
 * Unauthenticated requests receive HTTP 401. Normal users receive HTTP 403.
 * Authorized administrators can provision player accounts with scrypt hashing and wallets.
 */
router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    // 1. Enforce Administrator Authentication & Authorization
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
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Account registration is restricted to administrators. Public self-registration is disabled.'
        }
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Authentication token is invalid or expired.'
        }
      });
    }

    if (!decoded || !['admin', 'super_admin'].includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. Only authorized administrators can create user accounts.'
        }
      });
    }

    const admin = {
      id: decoded.userId !== undefined ? decoded.userId : decoded.id,
      uuid: decoded.uuid,
      username: decoded.username || 'admin',
      role: decoded.role
    };

    const {
      displayName,
      fullName,
      username,
      email,
      password,
      confirmPassword,
      phone,
      initialCoinBalance,
      initialBalance,
      accountStatus,
      status,
      role
    } = req.body || {};

    // 2. Delegate to authoritative user creation service
    const registeredUser = await createUserAccount({
      admin,
      displayName: displayName !== undefined ? displayName : fullName,
      fullName: displayName !== undefined ? displayName : fullName,
      username,
      email: email || null,
      password,
      confirmPassword,
      phone: phone || null,
      initialCoinBalance: initialCoinBalance !== undefined ? initialCoinBalance : (initialBalance !== undefined ? initialBalance : 0),
      initialBalance: initialCoinBalance !== undefined ? initialCoinBalance : (initialBalance !== undefined ? initialBalance : 0),
      accountStatus: accountStatus !== undefined ? accountStatus : (status !== undefined ? status : 'active'),
      status: accountStatus !== undefined ? accountStatus : (status !== undefined ? status : 'active'),
      role,
      ip: req.ip
    });

    // 3. Generate signed token for newly created player
    const authToken = generateToken({
      userId: registeredUser.id,
      uuid: registeredUser.uuid,
      username: registeredUser.username,
      email: registeredUser.email,
      role: registeredUser.role
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully by administrator.',
      token: authToken,
      user: registeredUser,
      data: {
        token: authToken,
        user: registeredUser
      }
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: {
          code: err.code || 'VALIDATION_ERROR',
          field: err.field,
          message: err.message
        }
      });
    }
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Verifies credentials and returns a secure signed token
 */
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { identifier, username, email, password } = req.body || {};

    const trimmedIdentifier = (identifier || username || email || '').trim();
    const rawPassword = password || '';

    if (!trimmedIdentifier || !rawPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CREDENTIALS',
          message: 'Please provide both your email/username and password.'
        }
      });
    }

    const pool = getPool();

    // Query user by username or email with parameterized query
    const [rows] = await pool.query(
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.password_hash, u.role, u.status, u.must_change_password, u.created_at,
              w.available_balance, w.exposure_balance
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.username = ? OR u.email = ?
       LIMIT 1`,
      [trimmedIdentifier, trimmedIdentifier]
    );

    // Generic error message to prevent username enumeration
    const invalidCredsResponse = {
      success: false,
      error: {
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid credentials. Please verify your email/username and password.'
      }
    };

    if (rows.length === 0) {
      return res.status(401).json(invalidCredsResponse);
    }

    const user = rows[0];

    // Constant-time password verification against scrypt hash
    const isPasswordValid = verifyPassword(rawPassword, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json(invalidCredsResponse);
    }

    // Verify account status
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: 'Your account is currently suspended or inactive. Please contact support.'
        }
      });
    }

    // Generate signed token
    const token = generateToken({
      userId: user.id,
      uuid: user.uuid,
      username: user.username,
      email: user.email,
      role: user.role
    });

    // Record session metadata (sha256 token hash)
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;
      const expiresAt = new Date(Date.now() + 86400 * 1000);

      await pool.query(
        `INSERT INTO sessions (token_hash, user_id, ip_address, user_agent, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), ip_address = VALUES(ip_address), user_agent = VALUES(user_agent)`,
        [tokenHash, user.id, clientIp, userAgent, expiresAt]
      );
    } catch (sessionErr) {
      console.warn('[AUTH] Session tracking record warning:', sessionErr.message);
    }

    const sanitized = sanitizeUser(user);
    const mustChange = Boolean(user.must_change_password);
    sanitized.must_change_password = mustChange;
    sanitized.mustChangePassword = mustChange;
    sanitized.wallet = {
      available_balance: parseFloat(user.available_balance || 0),
      exposure_balance: parseFloat(user.exposure_balance || 0),
      currency: 'INR'
    };

    return res.status(200).json({
      success: true,
      message: 'Signed in successfully.',
      token,
      mustChangePassword: mustChange,
      must_change_password: mustChange,
      user: sanitized,
      data: {
        token,
        user: sanitized,
        mustChangePassword: mustChange,
        must_change_password: mustChange
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Retrieves current authenticated user's profile and wallet information
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const pool = getPool();

    const [rows] = await pool.query(
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.role, u.status, u.must_change_password, u.created_at,
              w.available_balance, w.exposure_balance,
              p.dark_mode_enabled, p.toss_alerts, p.match_reminders, p.wallet_notices, p.promo_updates
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       LEFT JOIN user_preferences p ON u.id = p.user_id
       WHERE u.id = ?
       LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'Authenticated user profile not found.'
        }
      });
    }

    const userRow = rows[0];
    const sanitized = sanitizeUser(userRow);
    const mustChange = Boolean(userRow.must_change_password);
    sanitized.must_change_password = mustChange;
    sanitized.mustChangePassword = mustChange;
    sanitized.wallet = {
      available_balance: parseFloat(userRow.available_balance || 0),
      exposure_balance: parseFloat(userRow.exposure_balance || 0),
      currency: 'INR'
    };
    sanitized.preferences = {
      darkMode: Boolean(userRow.dark_mode_enabled),
      tossAlerts: Boolean(userRow.toss_alerts),
      matchReminders: Boolean(userRow.match_reminders),
      walletNotices: Boolean(userRow.wallet_notices),
      promoUpdates: Boolean(userRow.promo_updates)
    };

    return res.status(200).json({
      success: true,
      mustChangePassword: mustChange,
      must_change_password: mustChange,
      user: sanitized,
      data: {
        user: sanitized,
        mustChangePassword: mustChange,
        must_change_password: mustChange
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/auth/profile
 * Updates user profile details with strict field validation and mass-assignment protection
 */
router.put('/profile', authenticate, enforcePasswordChange, async (req, res, next) => {
  try {
    const { fullName, phone, username } = req.body || {};

    const updates = [];
    const params = [];

    if (fullName !== undefined) {
      const trimmed = String(fullName).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            field: 'fullName',
            message: 'Full name must be between 2 and 100 characters.'
          }
        });
      }
      updates.push('full_name = ?');
      params.push(trimmed);
    }

    if (phone !== undefined) {
      const trimmedPhone = phone ? String(phone).trim() : null;
      updates.push('phone = ?');
      params.push(trimmedPhone);
    }

    // Security & Immutability: Username is permanently non-editable by users.
    // The username field is never updated in the database.
    if (updates.length === 0) {
      if (username !== undefined && String(username).trim() !== (req.user.username || '')) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'IMMUTABLE_FIELD',
            field: 'username',
            message: 'Username cannot be changed.'
          }
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_UPDATES',
          message: 'No valid profile update fields provided.'
        }
      });
    }

    // IDOR Protection: Always update based on authenticated session ID (req.user.id)
    params.push(req.user.id);
    const pool = getPool();

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch and return updated profile with wallet
    const [rows] = await pool.query(
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.role, u.status, u.must_change_password, u.updated_at,
              w.available_balance, w.exposure_balance
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id = ?
       LIMIT 1`,
      [req.user.id]
    );

    const userRow = rows[0];
    const sanitized = sanitizeUser(userRow);
    sanitized.must_change_password = Boolean(userRow.must_change_password);
    sanitized.mustChangePassword = Boolean(userRow.must_change_password);
    sanitized.wallet = {
      available_balance: parseFloat(userRow.available_balance || 0),
      exposure_balance: parseFloat(userRow.exposure_balance || 0),
      currency: 'INR'
    };

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: sanitized,
      profile: sanitized,
      data: {
        user: sanitized
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/change-password
 * Verifies current/temporary password, updates to new hashed password, and clears must_change_password flag
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Both current password and new password are required.'
        }
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'New password must be at least 8 characters long.'
        }
      });
    }

    if (confirmPassword !== undefined && confirmPassword !== null && confirmPassword !== '') {
      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PASSWORD_MISMATCH',
            message: 'New password and confirmation password do not match.'
          }
        });
      }
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SAME_PASSWORD',
          message: 'New password cannot be identical to your current password.'
        }
      });
    }

    const pool = getPool();

    // Fetch current user's password hash and account details
    const [rows] = await pool.query(
      'SELECT id, uuid, full_name, username, email, phone, role, status, password_hash, must_change_password FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User account not found.'
        }
      });
    }

    // Verify current / temporary password
    const isCurrentValid = verifyPassword(currentPassword, rows[0].password_hash);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current / temporary password does not match.'
        }
      });
    }

    // Hash new password and clear must_change_password flag
    const newHash = hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?',
      [newHash, req.user.id]
    );

    // Fetch updated user with wallet
    const [updatedRows] = await pool.query(
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.role, u.status, u.must_change_password,
              w.available_balance, w.exposure_balance
       FROM users u
       LEFT JOIN wallets w ON u.id = w.user_id
       WHERE u.id = ? LIMIT 1`,
      [req.user.id]
    );

    const updatedUser = sanitizeUser(updatedRows[0]);
    updatedUser.must_change_password = false;
    updatedUser.mustChangePassword = false;
    updatedUser.wallet = {
      available_balance: parseFloat(updatedRows[0].available_balance || 0),
      exposure_balance: parseFloat(updatedRows[0].exposure_balance || 0),
      currency: 'INR'
    };

    // Generate refreshed token with verified claims
    const newToken = generateToken({
      userId: updatedUser.id,
      uuid: updatedUser.uuid,
      username: updatedUser.username,
      email: updatedUser.email,
      role: updatedUser.role
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. Your account is now fully secured.',
      token: newToken,
      mustChangePassword: false,
      must_change_password: false,
      user: updatedUser,
      data: {
        token: newToken,
        user: updatedUser,
        mustChangePassword: false,
        must_change_password: false
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Invalidates user session
 */
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const pool = getPool();
      await pool.query('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
    }

    return res.status(200).json({
      success: true,
      message: 'Signed out successfully.'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
