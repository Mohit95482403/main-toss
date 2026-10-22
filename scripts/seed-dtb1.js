const { getPool, closePool } = require('../backend/src/config/db');
const { hashPassword } = require('../backend/src/utils/crypto');

async function seedDtb1() {
  const pool = getPool();
  try {
    const [check] = await pool.query("SELECT id, username FROM users WHERE username = 'dtb1'");
    if (check.length === 0) {
      const hash = hashPassword('Dtb1@12345');
      const [res] = await pool.query(
        "INSERT INTO users (uuid, full_name, username, email, password_hash, role, status, must_change_password) VALUES (UUID(), 'mohit sonawane', 'dtb1', 'dtb1@example.com', ?, 'user', 'active', FALSE)",
        [hash]
      );
      await pool.query(
        "INSERT INTO wallets (user_id, available_balance, exposure_balance) VALUES (?, 1000.00, 0.00)",
        [res.insertId]
      );
      console.log(`[SEED] Created dtb1 user (ID: ${res.insertId}) with 1000.00 balance.`);
    } else {
      console.log(`[SEED] User dtb1 already exists (ID: ${check[0].id}).`);
    }
  } catch (err) {
    console.error('[SEED ERROR]', err);
  } finally {
    await closePool();
  }
}

seedDtb1();
