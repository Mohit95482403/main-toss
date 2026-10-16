/**
 * IRONMAN TOSS BOOK - Authoritative User Wallet API Router
 * Provides secure, authenticated endpoints for retrieving and verifying
 * the player's single authoritative coin balance directly from MySQL wallets table.
 */

const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Enforce authentication on all wallet endpoints
router.use(authenticate);

/**
 * GET /api/wallet/balance
 * Returns the authenticated user's authoritative balance from MySQL wallets table.
 * 
 * Guarantees:
 * 1. Strict authentication and user isolation (User A can never see User B's balance).
 * 2. Real-time database reading (no stale caches or hardcoded values).
 * 3. Genuine 0 balance is distinguished from failures.
 * 4. Database errors return HTTP 500, never a false 0 balance.
 */
router.get('/balance', async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.id;

    if (!userId || typeof userId !== 'number') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Valid user authentication required.'
        }
      });
    }

    const [rows] = await pool.query(
      `SELECT w.user_id, w.available_balance, w.exposure_balance, w.currency, w.updated_at,
              u.username, u.status
       FROM wallets w
       JOIN users u ON u.id = w.user_id
       WHERE w.user_id = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'No wallet record found for the authenticated user.'
        }
      });
    }

    const walletRow = rows[0];
    const availableBalance = parseFloat(walletRow.available_balance);
    const exposureBalance = parseFloat(walletRow.exposure_balance);
    const currency = walletRow.currency || 'INR';

    return res.status(200).json({
      success: true,
      balance: availableBalance,
      available_balance: availableBalance,
      exposure_balance: exposureBalance,
      currency,
      data: {
        userId: walletRow.user_id,
        username: walletRow.username,
        balance: availableBalance,
        availableBalance,
        exposureBalance,
        currency,
        updatedAt: walletRow.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
