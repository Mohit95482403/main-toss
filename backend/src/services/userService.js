/**
 * IRONMAN TOSS BOOK - User Creation Service
 * Implements secure, audited account provisioning for administrators.
 * Enforces role restriction, input validation, scrypt hashing, and atomic transactions.
 */

const crypto = require('crypto');
const { getPool } = require('../config/db');
const { hashPassword, sanitizeUser } = require('../utils/crypto');

/**
 * Core user creation handler
 * Callable by both POST /api/admin/users/create and POST /api/auth/register (admin-authorized)
 */
async function createUserAccount({
  admin,
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
  status = 'active',
  role = 'user',
  ip = '127.0.0.1'
}) {
  // 1. Input sanitization & validation
  const rawDisplayName = displayName !== undefined ? displayName : fullName;
  const trimmedName = (rawDisplayName || '').trim();
  const trimmedUsername = (username || '').trim();
  const rawPassword = password || '';
  const trimmedPhone = phone ? String(phone).trim() : null;

  // 1. Display Name: Required, 2-100 characters
  if (!trimmedName || trimmedName.length < 2 || trimmedName.length > 100) {
    const err = new Error('Display Name is required and must be between 2 and 100 characters.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.field = 'displayName';
    throw err;
  }

  // 2. Username: Required, 3-30 characters, alphanumeric & underscores
  if (!trimmedUsername || !/^[a-zA-Z0-9_]{3,30}$/.test(trimmedUsername)) {
    const err = new Error('Username must be 3-30 characters long and contain only letters, numbers, or underscores.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.field = 'username';
    throw err;
  }

  // 3. Password: Required, minimum 8 characters
  if (!rawPassword || rawPassword.length < 8) {
    const err = new Error('Password must be at least 8 characters long.');
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.field = 'password';
    throw err;
  }

  // 4. Confirm Password: If provided, must match Password
  if (confirmPassword !== undefined && confirmPassword !== null && confirmPassword !== '') {
    if (rawPassword !== confirmPassword) {
      const err = new Error('Password and Confirm Password do not match.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      err.field = 'confirmPassword';
      throw err;
    }
  }

  // 5. Initial Coin Balance: Non-negative number within supported limits (default 0)
  const rawCoinBalance = initialCoinBalance !== undefined ? initialCoinBalance : initialBalance;
  let cleanBalance = 0.00;
  if (rawCoinBalance !== undefined && rawCoinBalance !== null && rawCoinBalance !== '') {
    const parsedBalance = Number(rawCoinBalance);
    if (isNaN(parsedBalance) || parsedBalance < 0 || parsedBalance > 100000000) {
      const err = new Error('Initial coin balance must be a valid, non-negative amount within supported limits.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      err.field = 'initialCoinBalance';
      throw err;
    }
    cleanBalance = Math.round(parsedBalance * 100) / 100;
  }

  // 6. Account Status: Supported statuses (active, suspended, banned)
  const rawStatus = (accountStatus !== undefined ? accountStatus : status || '').toString().trim().toLowerCase();
  const allowedStatuses = ['active', 'suspended', 'banned'];
  if (rawStatus && !allowedStatuses.includes(rawStatus)) {
    const err = new Error(`Account status must be one of the supported values: ${allowedStatuses.join(', ')}.`);
    err.status = 400;
    err.code = 'VALIDATION_ERROR';
    err.field = 'accountStatus';
    throw err;
  }
  const finalStatus = (rawStatus && allowedStatuses.includes(rawStatus)) ? rawStatus : 'active';

  // Optional Email: NEVER required. If provided (legacy/tests), validate format.
  let trimmedEmail = null;
  if (email && typeof email === 'string' && email.trim().length > 0) {
    const candidateEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(candidateEmail) || candidateEmail.length > 150) {
      const err = new Error('The provided email address is invalid.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      err.field = 'email';
      throw err;
    }
    trimmedEmail = candidateEmail;
  }

  // Role validation: Only super_admin may provision another admin/super_admin; default is always 'user'
  let finalRole = 'user';
  if (role && ['admin', 'super_admin'].includes(role)) {
    if (admin && admin.role === 'super_admin') {
      finalRole = role;
    } else {
      finalRole = 'user'; // Fallback to safe default
    }
  }

  const pool = getPool();

  // 2. Duplicate checking
  if (trimmedEmail) {
    const [existing] = await pool.query(
      'SELECT id, username, email FROM users WHERE username = ? OR email = ? LIMIT 1',
      [trimmedUsername, trimmedEmail]
    );

    if (existing.length > 0) {
      const match = existing[0];
      const conflictField = match.username.toLowerCase() === trimmedUsername.toLowerCase() ? 'username' : 'email';
      const err = new Error(`An account with that ${conflictField} already exists.`);
      err.status = 409;
      err.code = 'DUPLICATE_ACCOUNT';
      err.field = conflictField;
      throw err;
    }
  } else {
    const [existing] = await pool.query(
      'SELECT id, username FROM users WHERE username = ? LIMIT 1',
      [trimmedUsername]
    );

    if (existing.length > 0) {
      const err = new Error(`An account with username "${trimmedUsername}" already exists.`);
      err.status = 409;
      err.code = 'DUPLICATE_ACCOUNT';
      err.field = 'username';
      throw err;
    }
  }

  // 3. Hash password using secure scrypt
  const passwordHash = hashPassword(rawPassword);
  const userUuid = crypto.randomUUID();

  // 4. Atomic MySQL Transaction
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert user record (email and phone are null when omitted)
    const [userResult] = await connection.query(
      `INSERT INTO users (uuid, full_name, username, email, phone, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userUuid, trimmedName, trimmedUsername, trimmedEmail, trimmedPhone, passwordHash, finalRole, finalStatus]
    );

    const newUserId = userResult.insertId;

    // Initialize wallet with initial balance
    await connection.query(
      `INSERT INTO wallets (user_id, available_balance, exposure_balance, currency)
       VALUES (?, ?, 0.00, 'INR')`,
      [newUserId, cleanBalance]
    );

    // Initialize user preferences
    await connection.query(
      `INSERT INTO user_preferences (user_id) VALUES (?)`,
      [newUserId]
    );

    // If initial coins are granted (> 0), record an authoritative ledger entry
    if (cleanBalance > 0) {
      const txUuid = crypto.randomUUID();
      const adminId = admin ? admin.id : newUserId;
      const adminUsername = admin ? admin.username : 'system_provisioner';

      await connection.query(
        `INSERT INTO coin_transactions 
         (transaction_uuid, user_id, username, admin_id, admin_username, action_type, amount, balance_before, balance_after, reason, idempotency_key, status)
         VALUES (?, ?, ?, ?, ?, 'ADMIN_CREDIT', ?, 0.00, ?, ?, ?, 'completed')`,
        [
          txUuid,
          newUserId,
          trimmedUsername,
          adminId,
          adminUsername,
          cleanBalance,
          cleanBalance,
          'Initial account provisioning balance',
          `init_bal_${newUserId}_${Date.now()}`
        ]
      );
    }

    // Insert audit log
    if (admin) {
      await connection.query(
        `INSERT INTO admin_audit_logs (admin_id, admin_username, action_type, target_type, target_id, target_identifier, details, ip_address)
         VALUES (?, ?, 'create_user', 'user', ?, ?, ?, ?)`,
        [
          admin.id,
          admin.username,
          newUserId,
          trimmedUsername,
          JSON.stringify({
            role: finalRole,
            status: finalStatus,
            initialCoinBalance: cleanBalance,
            email: trimmedEmail,
            displayName: trimmedName
          }),
          ip
        ]
      );
    }

    await connection.commit();

    // Prepare safe sanitized return object (NEVER return password hash)
    const sanitized = {
      id: newUserId,
      uuid: userUuid,
      display_name: trimmedName,
      displayName: trimmedName,
      full_name: trimmedName,
      fullName: trimmedName,
      username: trimmedUsername,
      email: trimmedEmail,
      phone: trimmedPhone,
      role: finalRole,
      status: finalStatus,
      account_status: finalStatus,
      accountStatus: finalStatus,
      wallet: {
        available_balance: cleanBalance,
        exposure_balance: 0.00,
        currency: 'INR'
      }
    };

    return sanitized;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  createUserAccount
};
