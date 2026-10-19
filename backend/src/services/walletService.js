/**
 * DADDY TOSS BOOK — Centralized Authoritative Wallet & Transaction Ledger Service
 * 
 * Single authoritative service for all coin balance operations across the platform:
 * - Atomicity: Every balance mutation is coupled with its immutable ledger entry in the same transaction.
 * - Concurrency Control: Serialized pessimistic locking (SELECT ... FOR UPDATE) and non-negative balance checks.
 * - Idempotency: Duplicate prevention at both transaction and ledger levels with cached replay.
 * - Non-Destructive Ledger: All historical entries are preserved; corrections use compensating entries.
 */

const crypto = require('crypto');
const { getPool } = require('../config/db');

function generateTransactionUuid() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'tx-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex');
}

/**
 * Format decimal values safely to 2 decimal places fixed precision.
 */
function roundCoin(val) {
  const num = typeof val === 'number' ? val : parseFloat(val || 0);
  if (isNaN(num)) return 0.00;
  return Math.round(num * 100) / 100;
}

/**
 * 1. Fetch Authoritative Wallet Balance
 */
async function getWalletBalance(userId, connection = null) {
  const pool = connection || getPool();
  const [rows] = await pool.query(
    'SELECT id, user_id, available_balance, exposure_balance, currency, version, updated_at FROM wallets WHERE user_id = ? LIMIT 1',
    [userId]
  );
  if (!rows || rows.length === 0) {
    return {
      userId,
      availableBalance: 0.00,
      exposureBalance: 0.00,
      currency: 'INR',
      version: 0,
      exists: false
    };
  }
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    availableBalance: roundCoin(r.available_balance),
    exposureBalance: roundCoin(r.exposure_balance),
    currency: r.currency || 'INR',
    version: r.version || 1,
    updatedAt: r.updated_at,
    exists: true
  };
}

/**
 * 2. Record an Immutable Transaction in coin_transactions Ledger
 */
async function recordLedgerTransaction({
  connection,
  userId,
  username,
  adminId = null,
  adminUsername = null,
  actionType,
  amount,
  balanceBefore,
  balanceAfter,
  reason,
  betId = null,
  matchId = null,
  settlementUuid = null,
  relatedTransactionId = null,
  idempotencyKey = null,
  status = 'completed',
  metadata = null
}) {
  if (!connection) {
    throw new Error('A valid MySQL database transaction connection is required to record a ledger transaction.');
  }

  const transactionUuid = generateTransactionUuid();
  const serializedMetadata = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

  await connection.query(
    `INSERT INTO coin_transactions (
      transaction_uuid,
      user_id,
      username,
      admin_id,
      admin_username,
      action_type,
      amount,
      balance_before,
      balance_after,
      reason,
      metadata,
      bet_id,
      match_id,
      settlement_uuid,
      related_transaction_id,
      idempotency_key,
      status,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      transactionUuid,
      userId,
      username,
      adminId,
      adminUsername,
      actionType,
      roundCoin(amount),
      roundCoin(balanceBefore),
      roundCoin(balanceAfter),
      reason,
      serializedMetadata,
      betId,
      matchId,
      settlementUuid,
      relatedTransactionId,
      idempotencyKey,
      status
    ]
  );

  return {
    transactionUuid,
    transactionId: transactionUuid,
    actionType,
    amount: roundCoin(amount),
    balanceBefore: roundCoin(balanceBefore),
    balanceAfter: roundCoin(balanceAfter),
    status
  };
}

/**
 * 3. Place Bet Debit (Wager Placement)
 * - Stake deducted from available_balance
 * - Exposure increased by stake
 * - Recorded as BET_STAKE_DEBIT in ledger
 */
async function placeBetDebit({
  userId,
  username,
  matchId,
  betId,
  stake,
  idempotencyKey = null,
  reason = null,
  metadata = null,
  connection
}) {
  if (!connection) throw new Error('Transaction connection required for placeBetDebit.');
  const stakeNum = roundCoin(stake);
  if (stakeNum <= 0) throw new Error('Stake amount must be strictly greater than zero.');

  // Lock wallet row
  const [walletRows] = await connection.query(
    'SELECT id, available_balance, exposure_balance, version FROM wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (!walletRows || walletRows.length === 0) {
    const err = new Error('Wallet not found for user.');
    err.status = 404;
    err.code = 'WALLET_NOT_FOUND';
    throw err;
  }

  const currentAvailable = roundCoin(walletRows[0].available_balance);
  const currentExposure = roundCoin(walletRows[0].exposure_balance);

  if (currentAvailable < stakeNum) {
    const err = new Error(`Insufficient available balance. Your balance is ₹${currentAvailable.toFixed(2)}, required ₹${stakeNum.toFixed(2)}.`);
    err.status = 400;
    err.code = 'INSUFFICIENT_FUNDS';
    err.availableBalance = currentAvailable;
    throw err;
  }

  const balanceAfter = roundCoin(currentAvailable - stakeNum);
  const exposureAfter = roundCoin(currentExposure + stakeNum);

  // Update wallet
  const [updateResult] = await connection.query(
    `UPDATE wallets 
     SET available_balance = available_balance - ?, 
         exposure_balance = exposure_balance + ?, 
         version = version + 1, 
         updated_at = NOW() 
     WHERE user_id = ? AND available_balance >= ?`,
    [stakeNum, stakeNum, userId, stakeNum]
  );

  if (updateResult.affectedRows !== 1) {
    const err = new Error('Concurrent wallet balance deduction conflict.');
    err.status = 409;
    err.code = 'BALANCE_UPDATE_CONFLICT';
    throw err;
  }

  // Insert ledger entry
  const defaultReason = reason || `Bet Placed: ${betId} (Stake ₹${stakeNum.toFixed(2)})`;
  const ledgerTx = await recordLedgerTransaction({
    connection,
    userId,
    username,
    actionType: 'BET_STAKE_DEBIT',
    amount: stakeNum,
    balanceBefore: currentAvailable,
    balanceAfter,
    reason: defaultReason,
    betId,
    matchId,
    idempotencyKey,
    metadata
  });

  return {
    success: true,
    availableBalance: balanceAfter,
    exposureBalance: exposureAfter,
    transactionUuid: ledgerTx.transactionUuid,
    stake: stakeNum
  };
}

/**
 * 4. Refund Cancelled Bet
 * - Stake returned to available_balance
 * - Exposure decremented by stake
 * - Recorded as BET_CANCEL_REFUND in ledger
 */
async function refundCancelledBet({
  userId,
  username,
  matchId,
  betId,
  stake,
  idempotencyKey = null,
  reason = null,
  relatedTransactionId = null,
  metadata = null,
  connection
}) {
  if (!connection) throw new Error('Transaction connection required for refundCancelledBet.');
  const stakeNum = roundCoin(stake);
  if (stakeNum <= 0) throw new Error('Refund stake must be strictly positive.');

  // Lock wallet row
  const [walletRows] = await connection.query(
    'SELECT id, available_balance, exposure_balance, version FROM wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (!walletRows || walletRows.length === 0) {
    const err = new Error('Wallet not found for user.');
    err.status = 404;
    err.code = 'WALLET_NOT_FOUND';
    throw err;
  }

  const currentAvailable = roundCoin(walletRows[0].available_balance);
  const currentExposure = roundCoin(walletRows[0].exposure_balance);

  const balanceAfter = roundCoin(currentAvailable + stakeNum);
  const exposureAfter = roundCoin(Math.max(0, currentExposure - stakeNum));

  // Update wallet
  const [updateResult] = await connection.query(
    `UPDATE wallets 
     SET available_balance = available_balance + ?, 
         exposure_balance = GREATEST(0, exposure_balance - ?), 
         version = version + 1, 
         updated_at = NOW() 
     WHERE user_id = ?`,
    [stakeNum, stakeNum, userId]
  );

  if (updateResult.affectedRows !== 1) {
    const err = new Error('Failed to update wallet for bet cancellation refund.');
    err.status = 500;
    throw err;
  }

  // Insert ledger entry
  const defaultReason = reason || `Bet Cancelled Refund: ${betId} (₹${stakeNum.toFixed(2)})`;
  const ledgerTx = await recordLedgerTransaction({
    connection,
    userId,
    username,
    actionType: 'BET_CANCEL_REFUND',
    amount: stakeNum,
    balanceBefore: currentAvailable,
    balanceAfter,
    reason: defaultReason,
    betId,
    matchId,
    relatedTransactionId,
    idempotencyKey,
    metadata
  });

  return {
    success: true,
    availableBalance: balanceAfter,
    exposureBalance: exposureAfter,
    refundAmount: stakeNum,
    transactionUuid: ledgerTx.transactionUuid
  };
}

/**
 * 5. Credit Winning Payout
 * - Payout (total return including stake) credited to available_balance
 * - Exposure decremented by original stake
 * - Recorded as BET_WON_PAYOUT in ledger
 */
async function creditWinningPayout({
  userId,
  username,
  matchId,
  betId,
  settlementUuid,
  payout,
  stake,
  idempotencyKey = null,
  reason = null,
  relatedTransactionId = null,
  metadata = null,
  connection
}) {
  if (!connection) throw new Error('Transaction connection required for creditWinningPayout.');
  const payoutNum = roundCoin(payout);
  const stakeNum = roundCoin(stake);

  // Lock wallet row
  const [walletRows] = await connection.query(
    'SELECT id, available_balance, exposure_balance, version FROM wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (!walletRows || walletRows.length === 0) {
    const err = new Error('Wallet not found for winning player.');
    err.status = 404;
    throw err;
  }

  const currentAvailable = roundCoin(walletRows[0].available_balance);
  const currentExposure = roundCoin(walletRows[0].exposure_balance);

  const balanceAfter = roundCoin(currentAvailable + payoutNum);
  const exposureAfter = roundCoin(Math.max(0, currentExposure - stakeNum));

  // Update wallet
  await connection.query(
    `UPDATE wallets 
     SET available_balance = available_balance + ?, 
         exposure_balance = GREATEST(0, exposure_balance - ?), 
         version = version + 1, 
         updated_at = NOW() 
     WHERE user_id = ?`,
    [payoutNum, stakeNum, userId]
  );

  // Insert ledger entry
  const defaultReason = reason || `Toss Bet Won: ${betId} on match ${matchId} (Payout ₹${payoutNum.toFixed(2)})`;
  const ledgerTx = await recordLedgerTransaction({
    connection,
    userId,
    username,
    actionType: 'BET_WON_PAYOUT',
    amount: payoutNum,
    balanceBefore: currentAvailable,
    balanceAfter,
    reason: defaultReason,
    betId,
    matchId,
    settlementUuid,
    relatedTransactionId,
    idempotencyKey,
    metadata
  });

  return {
    success: true,
    availableBalance: balanceAfter,
    exposureBalance: exposureAfter,
    payout: payoutNum,
    transactionUuid: ledgerTx.transactionUuid
  };
}

/**
 * 6. Clear Exposure Only (Losing or No-Result Bets)
 * - Stake was already deducted at placement -> NO balance change!
 * - Decrements exposure_balance by stake
 * - No duplicate balance deduction or ledger transaction
 */
async function clearExposureOnly({
  userId,
  stake,
  connection
}) {
  if (!connection) throw new Error('Transaction connection required for clearExposureOnly.');
  const stakeNum = roundCoin(stake);
  if (stakeNum <= 0) return;

  await connection.query(
    `UPDATE wallets 
     SET exposure_balance = GREATEST(0, exposure_balance - ?), 
         version = version + 1, 
         updated_at = NOW() 
     WHERE user_id = ?`,
    [stakeNum, userId]
  );
}

/**
 * 7. Reverse Settlement Debit (Compensating debit for reversed winning payouts)
 * - Checks player has sufficient balance to reverse payout
 * - Debits payout from available_balance
 * - Recorded as SETTLEMENT_REVERSAL_DEBIT in ledger
 */
async function reverseSettlementDebit({
  userId,
  username,
  matchId,
  betId,
  settlementUuid,
  reversalAmount,
  idempotencyKey = null,
  reason = null,
  relatedTransactionId = null,
  metadata = null,
  connection
}) {
  if (!connection) throw new Error('Transaction connection required for reverseSettlementDebit.');
  const revNum = roundCoin(reversalAmount);
  if (revNum <= 0) throw new Error('Reversal amount must be strictly positive.');

  // Lock wallet row
  const [walletRows] = await connection.query(
    'SELECT id, available_balance, exposure_balance, version FROM wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (!walletRows || walletRows.length === 0) {
    const err = new Error('Wallet not found for reversal.');
    err.status = 404;
    throw err;
  }

  const currentAvailable = roundCoin(walletRows[0].available_balance);
  const currentExposure = roundCoin(walletRows[0].exposure_balance);

  if (currentAvailable < revNum) {
    const shortfall = roundCoin(revNum - currentAvailable);
    const err = new Error(`Insufficient player balance for settlement reversal. Player only has ₹${currentAvailable.toFixed(2)}, required ₹${revNum.toFixed(2)} (Shortfall ₹${shortfall.toFixed(2)}).`);
    err.status = 422;
    err.code = 'INSUFFICIENT_BALANCE_FOR_REVERSAL';
    err.availableBalance = currentAvailable;
    err.requiredAmount = revNum;
    err.shortfall = shortfall;
    throw err;
  }

  const balanceAfter = roundCoin(currentAvailable - revNum);

  // Update wallet
  const [updateResult] = await connection.query(
    `UPDATE wallets 
     SET available_balance = available_balance - ?, 
         version = version + 1, 
         updated_at = NOW() 
     WHERE user_id = ? AND available_balance >= ?`,
    [revNum, userId, revNum]
  );

  if (updateResult.affectedRows !== 1) {
    const err = new Error('Concurrent conflict during settlement reversal debit.');
    err.status = 409;
    throw err;
  }

  // Insert ledger entry
  const defaultReason = reason || `Settlement Reversal Debit: Bet ${betId} payout reversed`;
  const ledgerTx = await recordLedgerTransaction({
    connection,
    userId,
    username,
    actionType: 'SETTLEMENT_REVERSAL_DEBIT',
    amount: revNum,
    balanceBefore: currentAvailable,
    balanceAfter,
    reason: defaultReason,
    betId,
    matchId,
    settlementUuid,
    relatedTransactionId,
    idempotencyKey,
    metadata
  });

  return {
    success: true,
    availableBalance: balanceAfter,
    exposureBalance: currentExposure,
    reversalAmount: revNum,
    transactionUuid: ledgerTx.transactionUuid
  };
}

/**
 * 8. Credit Resettlement Payout
 * - Payout credited to corrected winning selection
 * - Recorded as BET_RESETTLEMENT_PAYOUT in ledger
 */
async function creditResettlementPayout({
  userId,
  username,
  matchId,
  betId,
  settlementUuid,
  payout,
  idempotencyKey = null,
  reason = null,
  relatedTransactionId = null,
  metadata = null,
  connection
}) {
  if (!connection) throw new Error('Transaction connection required for creditResettlementPayout.');
  const payoutNum = roundCoin(payout);
  if (payoutNum <= 0) throw new Error('Resettlement payout must be positive.');

  // Lock wallet row
  const [walletRows] = await connection.query(
    'SELECT id, available_balance, exposure_balance, version FROM wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (!walletRows || walletRows.length === 0) {
    const err = new Error('Wallet not found for resettlement.');
    err.status = 404;
    throw err;
  }

  const currentAvailable = roundCoin(walletRows[0].available_balance);
  const currentExposure = roundCoin(walletRows[0].exposure_balance);
  const balanceAfter = roundCoin(currentAvailable + payoutNum);

  // Update wallet
  await connection.query(
    `UPDATE wallets 
     SET available_balance = available_balance + ?, 
         version = version + 1, 
         updated_at = NOW() 
     WHERE user_id = ?`,
    [payoutNum, userId]
  );

  // Insert ledger entry
  const defaultReason = reason || `Resettlement Payout: Bet ${betId} on corrected result (₹${payoutNum.toFixed(2)})`;
  const ledgerTx = await recordLedgerTransaction({
    connection,
    userId,
    username,
    actionType: 'BET_RESETTLEMENT_PAYOUT',
    amount: payoutNum,
    balanceBefore: currentAvailable,
    balanceAfter,
    reason: defaultReason,
    betId,
    matchId,
    settlementUuid,
    relatedTransactionId,
    idempotencyKey,
    metadata
  });

  return {
    success: true,
    availableBalance: balanceAfter,
    exposureBalance: currentExposure,
    payout: payoutNum,
    transactionUuid: ledgerTx.transactionUuid
  };
}

/**
 * 9. Apply Administrative Coin Adjustment (Credit or Debit)
 */
async function applyAdminAdjustment({
  adminId,
  adminUsername,
  userId,
  username,
  actionType,
  amount,
  reason,
  idempotencyKey = null,
  metadata = null,
  connection
}) {
  const pool = connection || getPool();
  const shouldCommitLocally = !connection;
  const conn = connection || await pool.getConnection();

  try {
    if (shouldCommitLocally) await conn.beginTransaction();

    const amtNum = roundCoin(amount);
    if (amtNum <= 0) {
      const err = new Error('Adjustment amount must be strictly greater than zero.');
      err.status = 400;
      err.code = 'INVALID_AMOUNT';
      throw err;
    }

    if (!['ADMIN_CREDIT', 'ADMIN_DEBIT'].includes(actionType)) {
      const err = new Error(`Invalid adjustment actionType: ${actionType}`);
      err.status = 400;
      err.code = 'INVALID_ACTION_TYPE';
      throw err;
    }

    if (!reason || reason.trim().length === 0) {
      const err = new Error('A mandatory reason is required for administrator coin adjustments.');
      err.status = 400;
      err.code = 'REASON_REQUIRED';
      throw err;
    }

    // Lock wallet row
    const [walletRows] = await conn.query(
      'SELECT id, available_balance, exposure_balance, version FROM wallets WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    if (!walletRows || walletRows.length === 0) {
      const err = new Error('Target player wallet not found.');
      err.status = 404;
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const currentAvailable = roundCoin(walletRows[0].available_balance);
    const currentExposure = roundCoin(walletRows[0].exposure_balance);

    let balanceAfter = currentAvailable;

    if (actionType === 'ADMIN_CREDIT') {
      balanceAfter = roundCoin(currentAvailable + amtNum);
      await conn.query(
        `UPDATE wallets 
         SET available_balance = available_balance + ?, 
             version = version + 1, 
             updated_at = NOW() 
         WHERE user_id = ?`,
        [amtNum, userId]
      );
    } else {
      // ADMIN_DEBIT
      if (currentAvailable < amtNum) {
        const err = new Error(`Cannot deduct ${amtNum.toFixed(2)} coins. Player only has ${currentAvailable.toFixed(2)} coins available.`);
        err.status = 400;
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
      }

      balanceAfter = roundCoin(currentAvailable - amtNum);
      const [deductRes] = await conn.query(
        `UPDATE wallets 
         SET available_balance = available_balance - ?, 
             version = version + 1, 
             updated_at = NOW() 
         WHERE user_id = ? AND available_balance >= ?`,
        [amtNum, userId, amtNum]
      );

      if (deductRes.affectedRows !== 1) {
        const err = new Error('Concurrent balance modification conflict during administrative deduction.');
        err.status = 409;
        throw err;
      }
    }

    // Record ledger transaction
    const ledgerTx = await recordLedgerTransaction({
      connection: conn,
      userId,
      username,
      adminId,
      adminUsername,
      actionType,
      amount: amtNum,
      balanceBefore: currentAvailable,
      balanceAfter,
      reason: reason.trim(),
      idempotencyKey,
      metadata
    });

    if (shouldCommitLocally) {
      await conn.commit();
    }

    return {
      success: true,
      actionType,
      amount: amtNum,
      balanceBefore: currentAvailable,
      balanceAfter,
      transactionUuid: ledgerTx.transactionUuid,
      transaction_uuid: ledgerTx.transactionUuid
    };
  } catch (err) {
    if (shouldCommitLocally && conn) {
      try { await conn.rollback(); } catch (rbErr) {}
    }
    throw err;
  } finally {
    if (shouldCommitLocally && conn) {
      conn.release();
    }
  }
}

/**
 * 10. Process Deposit Confirmation (Admin-approved manual or gateway topup)
 */
async function processDepositConfirmation({
  adminId,
  adminUsername,
  userId,
  username,
  amount,
  reason = 'Deposit confirmed and credited to player wallet',
  transactionRef = null,
  idempotencyKey = null,
  metadata = null,
  connection
}) {
  return applyAdminAdjustment({
    adminId,
    adminUsername,
    userId,
    username,
    actionType: 'ADMIN_CREDIT',
    amount,
    reason: transactionRef ? `${reason} (Ref: ${transactionRef})` : reason,
    idempotencyKey,
    metadata: {
      type: 'deposit_confirmation',
      transactionRef,
      ...(metadata || {})
    },
    connection
  });
}

/**
 * 11. Fetch Player Passbook / Ledger Transactions with filters and pagination
 */
async function getWalletTransactions(userId, options = {}, connection = null) {
  const pool = connection || getPool();
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, Math.max(1, parseInt(options.limit || 50, 10)));
  const offset = (page - 1) * limit;
  const typeFilter = (options.type || 'all').trim().toLowerCase();
  const search = (options.search || '').trim();

  // 1. Authoritative wallet balance
  const wallet = await getWalletBalance(userId, pool);

  // 2. Query filters
  const whereClauses = ['ct.user_id = ?'];
  const queryParams = [userId];

  if (typeFilter === 'credit') {
    whereClauses.push("ct.action_type IN ('ADMIN_CREDIT', 'BET_CANCEL_REFUND', 'BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT')");
  } else if (typeFilter === 'debit') {
    whereClauses.push("ct.action_type IN ('ADMIN_DEBIT', 'SETTLEMENT_REVERSAL_DEBIT', 'BET_STAKE_DEBIT')");
  }

  if (search.length > 0) {
    whereClauses.push('(ct.transaction_uuid LIKE ? OR ct.reason LIKE ? OR ct.action_type LIKE ? OR ct.bet_id LIKE ? OR ct.match_id LIKE ?)');
    const pattern = `%${search}%`;
    queryParams.push(pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

  // Total count for pagination
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM coin_transactions ct ${whereSql}`,
    queryParams
  );
  const totalRecords = parseInt(countRow.total || 0, 10);

  // Compute total credits and debits from ledger
  const [[totalsRow]] = await pool.query(
    `SELECT
      COALESCE(SUM(CASE WHEN action_type IN ('ADMIN_CREDIT', 'BET_CANCEL_REFUND', 'BET_WON_PAYOUT', 'BET_RESETTLEMENT_PAYOUT') THEN amount ELSE 0 END), 0) AS totalCredits,
      COALESCE(SUM(CASE WHEN action_type IN ('ADMIN_DEBIT', 'SETTLEMENT_REVERSAL_DEBIT', 'BET_STAKE_DEBIT') THEN amount ELSE 0 END), 0) AS totalDebits
     FROM coin_transactions
     WHERE user_id = ?`,
    [userId]
  );

  const totalCredits = roundCoin(totalsRow.totalCredits || 0);
  const totalDebits = roundCoin(totalsRow.totalDebits || 0);

  // Fetch paginated transactions
  const [rows] = await pool.query(
    `SELECT
      ct.id,
      ct.transaction_uuid,
      ct.user_id,
      ct.username,
      ct.admin_id,
      ct.admin_username,
      ct.action_type,
      ct.amount,
      ct.balance_before,
      ct.balance_after,
      ct.reason,
      ct.metadata,
      ct.bet_id,
      ct.match_id,
      ct.settlement_uuid,
      ct.related_transaction_id,
      ct.idempotency_key,
      ct.status,
      ct.created_at
     FROM coin_transactions ct
     ${whereSql}
     ORDER BY ct.created_at DESC, ct.id DESC
     LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  const formattedTransactions = rows.map((r) => {
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
    } else if (r.action_type === 'BET_STAKE_DEBIT') {
      title = 'Bet Placement';
      subtitle = r.reason || 'Wager Stake Deduction';
      category = 'Wager Stake';
    }

    return {
      id: r.transaction_uuid || `TXN-${r.id}`,
      transactionId: r.transaction_uuid || `TXN-${r.id}`,
      transactionUuid: r.transaction_uuid,
      numericId: r.id,
      actionType: r.action_type,
      title,
      subtitle,
      type: isCredit ? 'credit' : 'debit',
      amount: roundCoin(r.amount),
      openingBalance: roundCoin(r.balance_before),
      closingBalance: roundCoin(r.balance_after),
      balanceBefore: roundCoin(r.balance_before),
      balanceAfter: roundCoin(r.balance_after),
      status: r.status || 'completed',
      category,
      betId: r.bet_id,
      matchId: r.match_id,
      settlementUuid: r.settlement_uuid,
      relatedTransactionId: r.related_transaction_id,
      referenceCode: r.transaction_uuid || `TXN-${r.id}`,
      remarks: r.reason,
      timestamp: r.created_at,
      dateFormatted: createdDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      timeFormatted: createdDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    };
  });

  return {
    wallet: {
      availableBalance: wallet.availableBalance,
      exposureBalance: wallet.exposureBalance,
      currency: wallet.currency
    },
    summary: {
      totalCredits,
      totalDebits,
      availableBalance: wallet.availableBalance,
      exposureBalance: wallet.exposureBalance
    },
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit)
    },
    transactions: formattedTransactions
  };
}

module.exports = {
  getWalletBalance,
  getWalletTransactions,
  recordLedgerTransaction,
  placeBetDebit,
  refundCancelledBet,
  creditWinningPayout,
  clearExposureOnly,
  reverseSettlementDebit,
  creditResettlementPayout,
  applyAdminAdjustment,
  processDepositConfirmation,
  roundCoin
};
