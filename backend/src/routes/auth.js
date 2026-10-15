/**
 * IRONMAN TOSS BOOK - Authentication Routes
 * Implements secure registration, login, logout, profile management, and password change.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { getPool } = require('../config/db');
const { hashPassword, verifyPassword, generateToken, sanitizeUser } = require('../utils/crypto');
const { authenticate } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimiter');

// Rate limiter for authentication attempts: 10 attempts per 15 minutes in production, higher in development/testing
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxAttempts: process.env.NODE_ENV === 'production' ? 10 : 250,
  message: 'Too many authentication attempts from this IP address. Please try again in 15 minutes.'
});

/**
 * POST /api/auth/register
 * Creates a new user account with secure scrypt password hashing
 */
router.post('/register', authRateLimiter, async (req, res, next) => {
  try {
    const { fullName, username, email, password, phone } = req.body || {};

    // 1. Server-side Input Validation
    const trimmedName = (fullName || '').trim();
    const trimmedUsername = (username || '').trim();
    const trimmedEmail = (email || '').trim().toLowerCase();
    const rawPassword = password || '';
    const trimmedPhone = phone ? String(phone).trim() : null;

    if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'fullName',
          message: 'Full name is required and must be between 2 and 100 characters.'
        }
      });
    }

    if (!trimmedUsername || !/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'username',
          message: 'Username must be 3-30 characters long and contain only letters, numbers, or underscores.'
        }
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail || !emailRegex.test(trimmedEmail) || trimmedEmail.length > 150) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'email',
          message: 'A valid email address is required.'
        }
      });
    }

    if (!rawPassword || rawPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          field: 'password',
          message: 'Password must be at least 8 characters long.'
        }
      });
    }

    const pool = getPool();

    // 2. Check for duplicate account using parameterized query
    const [existing] = await pool.query(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
      [trimmedUsername, trimmedEmail]
    );

    if (existing.length > 0) {
      const match = existing[0];
      const conflictField = match.email === trimmedEmail ? 'email' : 'username';
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_ACCOUNT',
          field: conflictField,
          message: `An account with that ${conflictField} is already registered.`
        }
      });
    }

    // 3. Cryptographically hash password with scrypt + salt
    const passwordHash = hashPassword(rawPassword);
    const userUuid = crypto.randomUUID();

    // 4. Atomic transaction for user creation and wallet setup
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [userResult] = await connection.query(
        `INSERT INTO users (uuid, full_name, username, email, phone, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, ?, 'user', 'active')`,
        [userUuid, trimmedName, trimmedUsername, trimmedEmail, trimmedPhone, passwordHash]
      );

      const newUserId = userResult.insertId;

      // Initialize default wallet
      await connection.query(
        `INSERT INTO wallets (user_id, available_balance, exposure_balance, currency)
         VALUES (?, 0.00, 0.00, 'INR')`,
        [newUserId]
      );

      // Initialize default preferences
      await connection.query(
        `INSERT INTO user_preferences (user_id) VALUES (?)`,
        [newUserId]
      );

      await connection.commit();

      // 5. Generate secure signed auth token
      const token = generateToken({
        userId: newUserId,
        uuid: userUuid,
        username: trimmedUsername,
        email: trimmedEmail,
        role: 'user'
      });

      const registeredUser = {
        id: newUserId,
        uuid: userUuid,
        full_name: trimmedName,
        fullName: trimmedName,
        username: trimmedUsername,
        email: trimmedEmail,
        phone: trimmedPhone,
        role: 'user',
        status: 'active'
      };

      return res.status(201).json({
        success: true,
        message: 'Account created successfully.',
        token,
        user: registeredUser,
        data: {
          token,
          user: registeredUser
        }
      });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Verifies credentials and returns a secure signed token
 */
router.post('/login', authRateLimiter, async (req, res, next) => {
  try {
    const { identifier, password } = req.body || {};

    const trimmedIdentifier = (identifier || '').trim();
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
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.password_hash, u.role, u.status, u.created_at,
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
    return res.status(200).json({
      success: true,
      message: 'Signed in successfully.',
      token,
      user: sanitized,
      data: {
        token,
        user: sanitized
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
      `SELECT u.id, u.uuid, u.full_name, u.username, u.email, u.phone, u.role, u.status, u.created_at,
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
      user: sanitized,
      data: {
        user: sanitized
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
router.put('/profile', authenticate, async (req, res, next) => {
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

    if (username !== undefined) {
      const trimmedUsername = String(username).trim();
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            field: 'username',
            message: 'Username must be 3-30 characters long and contain only letters, numbers, or underscores.'
          }
        });
      }

      // Check unique constraint excluding current user
      const pool = getPool();
      const [existing] = await pool.query(
        'SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1',
        [trimmedUsername, req.user.id]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_USERNAME',
            message: 'This username is already taken by another account.'
          }
        });
      }

      updates.push('username = ?');
      params.push(trimmedUsername);
    }

    if (updates.length === 0) {
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

    // Fetch and return updated profile
    const [rows] = await pool.query(
      'SELECT id, uuid, full_name, username, email, phone, role, status, updated_at FROM users WHERE id = ? LIMIT 1',
      [req.user.id]
    );

    const sanitized = sanitizeUser(rows[0]);
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
 * Verifies current password and securely updates to new hashed password
 */
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

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

    // Fetch current user's password hash
    const [rows] = await pool.query(
      'SELECT password_hash FROM users WHERE id = ? LIMIT 1',
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

    // Verify current password
    const isCurrentValid = verifyPassword(currentPassword, rows[0].password_hash);
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_CURRENT_PASSWORD',
          message: 'Current password does not match.'
        }
      });
    }

    // Hash new password and update
    const newHash = hashPassword(newPassword);
    await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, req.user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.'
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
