/**
 * IRONMAN TOSS BOOK - Administrative Account Provisioning Utility (Day 14)
 * Secure, idempotent provisioning for the root system administrator.
 * Reads credentials from environment variables without exposing sensitive values.
 */

const { randomUUID } = require('crypto');
const { getPool, testConnection } = require('./db');
const { hashPassword } = require('../utils/crypto');

async function seedAdmin() {
  const dbStatus = await testConnection();
  if (!dbStatus.connected) {
    console.warn('[SEED ADMIN] Database unavailable. Skipping admin check.');
    return { success: false, reason: 'DB_UNAVAILABLE' };
  }

  const pool = getPool();

  try {
    // 1. Check if an admin or super_admin already exists
    const [existingAdmins] = await pool.query(
      "SELECT id, username, email, role FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1"
    );

    if (existingAdmins.length > 0) {
      return {
        success: true,
        created: false,
        admin: {
          id: existingAdmins[0].id,
          username: existingAdmins[0].username,
          role: existingAdmins[0].role
        },
        message: 'Administrator account already exists. Skipping provisioning.'
      };
    }

    // 2. Read configurable credentials from environment
    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const email = (process.env.ADMIN_EMAIL || 'admin@ironmantossbook.com').trim().toLowerCase();
    const phone = (process.env.ADMIN_PHONE || '9999999999').trim();
    const password = process.env.ADMIN_PASSWORD || 'Admin@Ironman2026';
    const fullName = (process.env.ADMIN_FULL_NAME || 'System Administrator').trim();

    // 3. Hash password using native scrypt with unique salt
    const passwordHash = await hashPassword(password);
    const userUuid = randomUUID();

    // 4. Insert super_admin user
    const [userResult] = await pool.query(
      `INSERT INTO users (uuid, full_name, username, email, phone, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, ?, 'super_admin', 'active')`,
      [userUuid, fullName, username, email, phone, passwordHash]
    );

    const adminId = userResult.insertId;

    // 5. Initialize administrative wallet
    await pool.query(
      `INSERT INTO wallets (user_id, available_balance, exposure_balance, currency)
       VALUES (?, 0.00, 0.00, 'INR')`,
      [adminId]
    );

    // 6. Initialize preferences
    await pool.query(
      `INSERT INTO user_preferences (user_id, dark_mode_enabled, toss_alerts, match_reminders, wallet_notices)
       VALUES (?, TRUE, TRUE, TRUE, TRUE)`,
      [adminId]
    );

    // 7. Record initial administrative audit log
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_username, action_type, target_type, target_id, target_identifier, details, ip_address)
       VALUES (?, ?, 'admin_provisioned', 'system', ?, ?, ?, '127.0.0.1')`,
      [
        adminId,
        username,
        adminId,
        username,
        JSON.stringify({ event: 'Initial root administrator account provisioned', role: 'super_admin' })
      ]
    );

    console.log(`[SEED ADMIN] Root administrator "${username}" (${email}) provisioned successfully.`);

    return {
      success: true,
      created: true,
      admin: {
        id: adminId,
        uuid: userUuid,
        username,
        email,
        role: 'super_admin'
      }
    };
  } catch (error) {
    console.error('[SEED ADMIN] Error during administrator provisioning:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Allow direct CLI execution: node backend/src/config/seedAdmin.js
if (require.main === module) {
  require('dotenv').config();
  seedAdmin()
    .then((res) => {
      console.log('Result:', JSON.stringify(res, null, 2));
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = {
  seedAdmin
};
