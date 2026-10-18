/**
 * IRONMAN TOSS BOOK - Player Passbook & Financial Ledger Router
 * Returns authentic transaction ledger records and wallet balances from MySQL for the authenticated player.
 */

const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Enforce authentication on passbook endpoints
router.use(authenticate);

/**
 * GET /api/passbook/transactions
 * Returns genuine transactions from coin_transactions and wallet balances directly from MySQL.
 */
router.get('/transactions', async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const typeFilter = (req.query.type || 'all').trim().toLowerCase();
    const search = (req.query.search || '').trim();

    // 1. Fetch authoritative wallet balance
    const [[walletRow]] = await pool.query(
      'SELECT available_balance, exposure_balance, currency FROM wallets WHERE user_id = ? LIMIT 1',
      [userId]
    );

    const availableBalance = parseFloat((walletRow && walletRow.available_balance) || 0);
    const exposureBalance = parseFloat((walletRow && walletRow.exposure_balance) || 0);
    const currency = (walletRow && walletRow.currency) || 'INR';

    // 2. Build parameterized query for coin_transactions
    const whereClauses = ['ct.user_id = ?'];
    const queryParams = [userId];

    if (typeFilter === 'credit') {
      whereClauses.push("ct.action_type IN ('ADMIN_CREDIT', 'BET_CANCEL_REFUND', 'BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT')");
    } else if (typeFilter === 'debit') {
      whereClauses.push("ct.action_type IN ('ADMIN_DEBIT', 'SETTLEMENT_REVERSAL_DEBIT')");
    }

    if (search.length > 0) {
      whereClauses.push('(ct.transaction_uuid LIKE ? OR ct.reason LIKE ? OR ct.action_type LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern, pattern);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Query transactions
    const [rows] = await pool.query(
      `SELECT
        ct.id,
        ct.transaction_uuid,
        ct.action_type,
        ct.amount,
        ct.balance_before,
        ct.balance_after,
        ct.reason,
        ct.status,
        ct.created_at
       FROM coin_transactions ct
       ${whereSql}
       ORDER BY ct.created_at DESC`,
      queryParams
    );

    // Concurrently compute total credits and debits from MySQL for this player
    const [[totalsRow]] = await pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN action_type IN ('ADMIN_CREDIT', 'BET_CANCEL_REFUND', 'BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT') THEN amount ELSE 0 END), 0) AS totalCredits,
        COALESCE(SUM(CASE WHEN action_type IN ('ADMIN_DEBIT', 'SETTLEMENT_REVERSAL_DEBIT') THEN amount ELSE 0 END), 0) AS totalDebits
       FROM coin_transactions
       WHERE user_id = ?`,
      [userId]
    );

    const totalCredits = parseFloat(totalsRow.totalCredits || 0);
    const totalDebits = parseFloat(totalsRow.totalDebits || 0);

    const transactions = rows.map((r) => {
      const isCredit = ['ADMIN_CREDIT', 'BET_CANCEL_REFUND', 'BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT'].includes(r.action_type);
      const createdDate = new Date(r.created_at);

      let title = isCredit ? 'Account Credit' : 'Account Debit';
      let subtitle = r.reason || (isCredit ? 'Admin Balance Credit' : 'Admin Balance Debit');
      let category = isCredit ? 'Admin Credit' : 'Admin Debit';

      if (r.action_type === 'BET_CANCEL_REFUND') {
        title = 'Bet Refund (Cancelled)';
        subtitle = r.reason || 'Stake Refund for Cancelled Bet';
        category = 'Bet Refund';
      } else if (r.action_type === 'BET_WON_PAYOUT') {
        title = 'Bet Won (Payout)';
        subtitle = r.reason || 'Official Toss Win Payout';
        category = 'Bet Winnings';
      } else if (r.action_type === 'BET_RESETTLEMENT_PAYOUT') {
        title = 'Resettlement Payout';
        subtitle = r.reason || 'Corrected Toss Win Payout';
        category = 'Bet Winnings';
      } else if (r.action_type === 'SETTLEMENT_REVERSAL_DEBIT') {
        title = 'Settlement Reversal';
        subtitle = r.reason || 'Payout Reversed (Result Correction)';
        category = 'Settlement Reversal';
      }

      return {
        id: r.transaction_uuid || `TXN-${r.id}`,
        numericId: r.id,
        actionType: r.action_type,
        title,
        subtitle,
        type: isCredit ? 'credit' : 'debit',
        amount: parseFloat(r.amount),
        openingBalance: parseFloat(r.balance_before),
        closingBalance: parseFloat(r.balance_after),
        status: r.status || 'completed',
        category,
        referenceCode: r.transaction_uuid || `TXN-${r.id}`,
        remarks: r.reason,
        timestamp: r.created_at,
        dateFormatted: createdDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        timeFormatted: createdDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        wallet: {
          availableBalance,
          exposureBalance,
          currency
        },
        summary: {
          totalCredits,
          totalDebits,
          availableBalance,
          exposureBalance
        },
        transactions
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
