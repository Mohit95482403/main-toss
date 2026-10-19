/**
 * DADDY TOSS BOOK — Financial Ledger Reconciliation Service
 * 
 * Provides read-only mathematical verification of player balances and exposure:
 * 1. Stored Wallet Balance vs Ledger Sum (Credits - Debits from coin_transactions).
 * 2. Stored Exposure Balance vs Pending Bets Stakes sum.
 * 3. Read-only by default: Never silently modifies production balances.
 * 4. Flags discrepancies with forensic breakdown for administrative auditing.
 */

const { getPool } = require('../config/db');

/**
 * Reconcile a single user's wallet against the authoritative ledger and active tickets.
 * 
 * @param {object} pool - MySQL connection pool
 * @param {number} userId - User ID to reconcile
 * @returns {Promise<object>} Detailed forensic reconciliation report
 */
async function reconcileUserWallet(pool, userId) {
  const p = pool || getPool();

  // 1. Fetch user & wallet record
  const [userRows] = await p.query(
    `SELECT u.id, u.username, u.email, u.status AS user_status,
            w.available_balance, w.exposure_balance, w.currency, w.updated_at AS wallet_updated_at
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );

  if (userRows.length === 0) {
    return {
      userId,
      found: false,
      error: 'User not found'
    };
  }

  const u = userRows[0];
  const storedBalance = parseFloat(u.available_balance || 0);
  const storedExposure = parseFloat(u.exposure_balance || 0);

  // 2. Compute ledger totals from coin_transactions
  const [[ledgerRow]] = await p.query(
    `SELECT 
      COUNT(*) AS totalTransactions,
      COALESCE(SUM(CASE 
        WHEN action_type IN ('ADMIN_CREDIT', 'BET_CANCEL_REFUND', 'BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT') 
        THEN amount ELSE 0 END), 0) AS totalCredits,
      COALESCE(SUM(CASE 
        WHEN action_type IN ('ADMIN_DEBIT', 'SETTLEMENT_REVERSAL_DEBIT', 'BET_STAKE_DEBIT') 
        THEN amount ELSE 0 END), 0) AS totalDebits,
      COALESCE(SUM(CASE WHEN action_type = 'BET_STAKE_DEBIT' THEN amount ELSE 0 END), 0) AS betStakeDebits,
      COALESCE(SUM(CASE WHEN action_type = 'BET_CANCEL_REFUND' THEN amount ELSE 0 END), 0) AS cancelRefunds,
      COALESCE(SUM(CASE WHEN action_type IN ('BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT') THEN amount ELSE 0 END), 0) AS winPayouts,
      COALESCE(SUM(CASE WHEN action_type = 'ADMIN_CREDIT' THEN amount ELSE 0 END), 0) AS adminCredits,
      COALESCE(SUM(CASE WHEN action_type = 'ADMIN_DEBIT' THEN amount ELSE 0 END), 0) AS adminDebits,
      COALESCE(SUM(CASE WHEN action_type = 'SETTLEMENT_REVERSAL_DEBIT' THEN amount ELSE 0 END), 0) AS reversalDebits
     FROM coin_transactions
     WHERE user_id = ?`,
    [userId]
  );

  const totalCredits = parseFloat(ledgerRow.totalCredits || 0);
  const totalDebits = parseFloat(ledgerRow.totalDebits || 0);
  const ledgerCalculatedBalance = Math.round((totalCredits - totalDebits) * 100) / 100;
  const balanceDifference = Math.round((storedBalance - ledgerCalculatedBalance) * 100) / 100;

  // 3. Compute active exposure from pending bets
  const [[exposureRow]] = await p.query(
    `SELECT 
      COUNT(*) AS pendingBetsCount,
      COALESCE(SUM(stake), 0) AS pendingStakeTotal
     FROM bets
     WHERE user_id = ? AND status = 'pending' AND settlement_status = 'pending'`,
    [userId]
  );

  const pendingExposureCalculated = parseFloat(exposureRow.pendingStakeTotal || 0);
  const exposureDifference = Math.round((storedExposure - pendingExposureCalculated) * 100) / 100;

  // Check consistency (tolerating sub-cent roundoff < 0.005)
  const isBalanceConsistent = Math.abs(balanceDifference) < 0.01;
  const isExposureConsistent = Math.abs(exposureDifference) < 0.01;
  const isConsistent = isBalanceConsistent && isExposureConsistent;

  let explanation = 'Wallet balances and ledger records match authoritative financial state.';
  if (!isBalanceConsistent) {
    explanation = `Available balance discrepancy detected: Stored balance (${storedBalance.toFixed(2)}) differs from net ledger sum (${ledgerCalculatedBalance.toFixed(2)}) by ${balanceDifference > 0 ? '+' : ''}${balanceDifference.toFixed(2)}.`;
  } else if (!isExposureConsistent) {
    explanation = `Exposure balance discrepancy detected: Stored exposure (${storedExposure.toFixed(2)}) differs from active pending tickets (${pendingExposureCalculated.toFixed(2)}) by ${exposureDifference > 0 ? '+' : ''}${exposureDifference.toFixed(2)}.`;
  }

  return {
    userId: u.id,
    username: u.username,
    email: u.email,
    userStatus: u.user_status,
    currency: u.currency || 'INR',
    storedBalance,
    storedExposure,
    ledger: {
      totalTransactions: parseInt(ledgerRow.totalTransactions || 0, 10),
      totalCredits,
      totalDebits,
      calculatedBalance: ledgerCalculatedBalance,
      breakdown: {
        adminCredits: parseFloat(ledgerRow.adminCredits || 0),
        adminDebits: parseFloat(ledgerRow.adminDebits || 0),
        betStakeDebits: parseFloat(ledgerRow.betStakeDebits || 0),
        cancelRefunds: parseFloat(ledgerRow.cancelRefunds || 0),
        winPayouts: parseFloat(ledgerRow.winPayouts || 0),
        reversalDebits: parseFloat(ledgerRow.reversalDebits || 0)
      }
    },
    exposure: {
      pendingBetsCount: parseInt(exposureRow.pendingBetsCount || 0, 10),
      calculatedExposure: pendingExposureCalculated
    },
    discrepancy: {
      hasDiscrepancy: !isConsistent,
      balanceDifference,
      exposureDifference,
      status: isConsistent ? 'MATCH' : 'DISCREPANCY',
      explanation
    },
    reconciledAt: new Date().toISOString()
  };
}

/**
 * Perform platform-wide wallet reconciliation across players.
 * 
 * @param {object} pool - MySQL connection pool
 * @param {object} options - Pagination and filter options
 * @returns {Promise<object>} Reconciliation overview and player reports
 */
async function reconcileAllWallets(pool, options = {}) {
  const p = pool || getPool();
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 50, 10)));
  const offset = (page - 1) * limit;
  const onlyDiscrepancies = Boolean(options.onlyDiscrepancies);

  // 1. Fetch user IDs
  const [users] = await p.query(
    'SELECT id FROM users ORDER BY id ASC LIMIT ? OFFSET ?',
    [limit, offset]
  );

  const results = [];
  let discrepancyCount = 0;
  let matchCount = 0;

  for (const row of users) {
    const report = await reconcileUserWallet(p, row.id);
    if (report.discrepancy.hasDiscrepancy) {
      discrepancyCount++;
      results.push(report);
    } else {
      matchCount++;
      if (!onlyDiscrepancies) {
        results.push(report);
      }
    }
  }

  // Total user count for pagination
  const [[countRow]] = await p.query('SELECT COUNT(*) AS total FROM users');
  const totalUsers = parseInt(countRow.total || 0, 10);

  return {
    summary: {
      totalUsersScanned: users.length,
      platformTotalUsers: totalUsers,
      matchCount,
      discrepancyCount,
      isClean: discrepancyCount === 0,
      page,
      limit,
      totalPages: Math.ceil(totalUsers / limit)
    },
    accounts: results,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  reconcileUserWallet,
  reconcileAllWallets
};
