/**
 * IRONMAN TOSS BOOK - Player Bets API Router
 * Returns authentic wager history and calculated metrics directly from MySQL for the authenticated player.
 */

const express = require('express');
const { getPool } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Enforce authentication on player betting endpoints
router.use(authenticate);

/**
 * GET /api/bets/my-bets
 * Returns the authenticated player's genuine bets from MySQL.
 */
router.get('/my-bets', async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const filter = (req.query.status || 'all').trim().toLowerCase();
    const search = (req.query.search || '').trim();

    // 1. Calculate genuine summary metrics for this player from MySQL
    const [[metricsRow]] = await pool.query(
      `SELECT
        COUNT(*) AS totalCount,
        COALESCE(SUM(stake), 0) AS totalStake,
        SUM(CASE WHEN status = 'live' OR status = 'pending' THEN 1 ELSE 0 END) AS liveCount,
        COALESCE(SUM(CASE WHEN status = 'live' OR status = 'pending' THEN stake ELSE 0 END), 0) AS liveStake,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) AS wonCount,
        COALESCE(SUM(CASE WHEN status = 'won' THEN payout ELSE 0 END), 0) AS wonReturn,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) AS lostCount,
        COALESCE(SUM(CASE WHEN status = 'lost' THEN stake ELSE 0 END), 0) AS lostStake,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelledCount,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN stake ELSE 0 END), 0) AS cancelledStake
       FROM bets
       WHERE user_id = ?`,
      [userId]
    );

    const summary = {
      totalCount: parseInt(metricsRow.totalCount || 0, 10),
      totalStake: parseFloat(metricsRow.totalStake || 0),
      liveCount: parseInt(metricsRow.liveCount || 0, 10),
      liveStake: parseFloat(metricsRow.liveStake || 0),
      wonCount: parseInt(metricsRow.wonCount || 0, 10),
      wonReturn: parseFloat(metricsRow.wonReturn || 0),
      lostCount: parseInt(metricsRow.lostCount || 0, 10),
      lostStake: parseFloat(metricsRow.lostStake || 0),
      cancelledCount: parseInt(metricsRow.cancelledCount || 0, 10),
      cancelledStake: parseFloat(metricsRow.cancelledStake || 0)
    };

    // 2. Build parameterized query for the player's bet records
    const whereClauses = ['b.user_id = ?'];
    const queryParams = [userId];

    if (filter !== 'all') {
      if (filter === 'live') {
        whereClauses.push("(b.status = 'live' OR b.status = 'pending')");
      } else if (['won', 'lost', 'no_result', 'cancelled'].includes(filter)) {
        whereClauses.push('b.status = ?');
        queryParams.push(filter);
      }
    }

    if (search.length > 0) {
      whereClauses.push('(b.id LIKE ? OR b.selection LIKE ? OR m.match_title LIKE ? OR m.competition LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    const [rows] = await pool.query(
      `SELECT
        b.id,
        b.match_id,
        b.market_name,
        b.selection,
        b.stake,
        b.odds,
        b.potential_return,
        b.status,
        b.settlement_status,
        b.payout,
        b.refund_amount,
        b.cancelled_at,
        b.settled_at,
        b.created_at,
        COALESCE(m.match_title, 'Match Fixture') AS match_title,
        COALESCE(m.competition, 'Cricket Tournament') AS competition,
        COALESCE(m.team_one, 'Team One') AS team_one,
        m.team_one_logo,
        COALESCE(m.team_two, 'Team Two') AS team_two,
        m.team_two_logo,
        m.status AS match_status,
        m.settled AS match_settled,
        m.match_start_time,
        m.match_end_time,
        m.scheduled_time,
        m.toss_winner
       FROM bets b
       LEFT JOIN matches m ON m.id = b.match_id
       ${whereSql}
       ORDER BY b.created_at DESC`,
      queryParams
    );

    const now = Date.now();
    const bets = rows.map((r) => {
      let resultText = 'Awaiting match toss declaration';
      if (r.status === 'won') {
        resultText = `${r.selection} won the toss. Settlement credited to balance.`;
      } else if (r.status === 'lost') {
        resultText = `${r.toss_winner ? r.toss_winner : 'Opponent'} won the toss.`;
      } else if (r.status === 'no_result') {
        resultText = 'Match abandoned / no result. Stake refunded.';
      } else if (r.status === 'cancelled') {
        resultText = 'CANCELLED — Stake Refunded';
      }

      let selectedTeamLogo = null;
      if (r.selection === r.team_one) selectedTeamLogo = r.team_one_logo;
      else if (r.selection === r.team_two) selectedTeamLogo = r.team_two_logo;

      // Evaluation of cancellation eligibility:
      // A pending bet is cancellable only before the match starts:
      // 1. Bet must be pending/live and unsettled
      // 2. Match must be 'upcoming' and unsettled
      // 3. Match start time (if set) and match end time must be in the future
      const isPending = (r.status === 'pending' || r.status === 'live');
      const isUnsettled = (r.settlement_status === 'pending') && !Boolean(r.match_settled);
      const isUpcoming = (r.match_status === 'upcoming');
      const isStartTimeFuture = !r.match_start_time || (new Date(r.match_start_time).getTime() > now);
      const isEndTimeFuture = !r.match_end_time || (new Date(r.match_end_time).getTime() > now);

      const canCancel = Boolean(isPending && isUnsettled && isUpcoming && isStartTimeFuture && isEndTimeFuture);

      return {
        id: r.id,
        matchId: r.match_id,
        competition: r.competition,
        matchTitle: r.match_title,
        teamOne: r.team_one,
        teamOneLogo: r.team_one_logo || null,
        team_one_logo: r.team_one_logo || null,
        teamTwo: r.team_two,
        teamTwoLogo: r.team_two_logo || null,
        team_two_logo: r.team_two_logo || null,
        selectedTeamLogo: selectedTeamLogo || null,
        marketName: r.market_name || 'Toss Winner',
        selectedTeam: r.selection,
        rate: parseFloat(r.odds),
        stake: parseFloat(r.stake),
        potentialReturn: parseFloat(r.potential_return),
        status: r.status,
        settlementStatus: r.settlement_status,
        payout: parseFloat(r.payout || 0),
        refundAmount: parseFloat(r.refund_amount || 0),
        resultText,
        canCancel,
        placedAt: r.created_at,
        settledAt: r.settled_at,
        cancelledAt: r.cancelled_at
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        bets,
        summary
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bets/place (alias: POST /api/bets)
 * Secure, transactional player wager placement.
 * Validates match state, selection, stake, and available balance with row locks.
 */
async function handlePlaceBet(req, res, next) {
  const pool = getPool();
  let connection = null;

  try {
    const userId = req.user.id;
    const rawMatchId = req.body.matchId !== undefined ? String(req.body.matchId) : (req.body.match_id !== undefined ? String(req.body.match_id) : '');
    const rawSelection = req.body.selection || req.body.selectedTeam || req.body.team;
    const rawStake = req.body.stake !== undefined ? req.body.stake : req.body.amount;

    const matchId = (rawMatchId || '').trim();
    const selection = typeof rawSelection === 'string' ? rawSelection.trim() : '';

    // 1. Basic Input & Match Validation
    if (!matchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_MATCH_ID', message: 'Match identifier is required.' },
        message: 'Match identifier is required.'
      });
    }

    if (!selection) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_SELECTION', message: 'Please select a team to win the toss.' },
        message: 'Please select a team to win the toss.'
      });
    }

    // 2. Strict Stake Input Validation (Min ₹50, Max ₹100,000)
    if (rawStake === undefined || rawStake === null || typeof rawStake === 'boolean') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAKE', message: 'Please enter a valid stake amount.' },
        message: 'Please enter a valid stake amount.'
      });
    }

    const stakeStr = String(rawStake).trim();
    if (stakeStr === '' || stakeStr === 'null' || stakeStr === 'undefined') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAKE', message: 'Please enter a valid stake amount.' },
        message: 'Please enter a valid stake amount.'
      });
    }

    // Disallow non-numeric strings such as "100abc", "Infinity", "NaN"
    if (!/^-?\d+(\.\d+)?$/.test(stakeStr)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAKE', message: 'Please enter a valid stake amount.' },
        message: 'Please enter a valid stake amount.'
      });
    }

    const stakeNum = Number(stakeStr);
    if (isNaN(stakeNum) || !Number.isFinite(stakeNum)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAKE', message: 'Please enter a valid stake amount.' },
        message: 'Please enter a valid stake amount.'
      });
    }

    // Zero & Negative amounts rejected
    if (stakeNum <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAKE', message: 'Stake amount must be a positive number greater than 0.' },
        message: 'Stake amount must be a positive number greater than 0.'
      });
    }

    // Currency Decimal Precision Check (at most 2 decimal places)
    const decimalParts = stakeStr.split('.');
    if (decimalParts.length === 2 && decimalParts[1].length > 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAKE_PRECISION', message: 'Stake amount cannot have more than 2 decimal places.' },
        message: 'Stake amount cannot have more than 2 decimal places.'
      });
    }

    // Fixed Minimum Stake Boundary: ₹50
    if (stakeNum < 50) {
      return res.status(400).json({
        success: false,
        error: { code: 'MIN_STAKE_ERROR', message: 'Minimum stake amount is ₹50.' },
        message: 'Minimum stake amount is ₹50.'
      });
    }

    // Fixed Maximum Stake Boundary: ₹100,000
    if (stakeNum > 100000) {
      return res.status(400).json({
        success: false,
        error: { code: 'MAX_STAKE_ERROR', message: 'Maximum stake amount is ₹100,000.' },
        message: 'Maximum stake amount is ₹100,000.'
      });
    }

    const stake = parseFloat(stakeNum.toFixed(2));

    // 2. Transactional validation & atomic placement
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 2a. Row-lock match to verify current status and authoritative expiry
    const [matchRows] = await connection.query(
      'SELECT id, match_title, competition, team_one, team_one_rate, team_two, team_two_rate, status, settled, match_end_time FROM matches WHERE id = ? FOR UPDATE',
      [matchId]
    );

    if (matchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'MATCH_NOT_FOUND', message: 'Match fixture not found in database.' }
      });
    }

    const match = matchRows[0];

    // Check if match is closed or settled
    if (match.settled || match.status === 'completed' || match.status === 'abandoned' || match.status === 'closed') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'BETTING_CLOSED', message: 'Betting on this match is closed.' }
      });
    }

    // Check if match has expired based on real database match_end_time
    if (!match.match_end_time) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: {
          code: 'MATCH_EXPIRED',
          message: 'This match has expired and betting is closed.'
        }
      });
    }

    const matchEndTimeMs = new Date(match.match_end_time).getTime();
    if (isNaN(matchEndTimeMs) || matchEndTimeMs <= Date.now()) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: {
          code: 'MATCH_EXPIRED',
          message: 'This match has expired and betting is closed.'
        }
      });
    }

    // Check if selection matches team_one or team_two
    let rate = 0;
    if (selection.toLowerCase() === match.team_one.toLowerCase()) {
      rate = parseFloat(match.team_one_rate || 1.90);
    } else if (selection.toLowerCase() === match.team_two.toLowerCase()) {
      rate = parseFloat(match.team_two_rate || 1.90);
    } else {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TEAM_SELECTION',
          message: `Selection "${selection}" is invalid. Must choose either "${match.team_one}" or "${match.team_two}".`
        }
      });
    }

    // 2b. Row-lock player wallet
    const [walletRows] = await connection.query(
      'SELECT id, available_balance, exposure_balance, currency, version FROM wallets WHERE user_id = ? FOR UPDATE',
      [userId]
    );

    if (walletRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'WALLET_NOT_FOUND', message: 'Player wallet record not found.' }
      });
    }

    const wallet = walletRows[0];
    const availableBalance = parseFloat(wallet.available_balance || 0);

    if (availableBalance < stake) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_BALANCE',
          message: `Insufficient available balance. Required: ₹${stake.toFixed(2)}, Available: ₹${availableBalance.toFixed(2)}.`
        }
      });
    }

    // 2c. Calculate potential return & profit
    const potentialReturn = parseFloat((stake * rate).toFixed(2));
    const betId = `BET-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    // 2d. Insert Bet Ticket
    await connection.query(
      `INSERT INTO bets (
        id, user_id, match_id, market_name, selection,
        stake, odds, potential_return, status, settlement_status,
        payout, settled_at, settled_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'Toss Winner', ?, ?, ?, ?, 'pending', 'pending', 0.00, NULL, NULL, NOW(), NOW())`,
      [betId, userId, match.id, selection, stake, rate, potentialReturn]
    );

    // 2e. Deduct Stake from Available Balance, Increase Exposure
    await connection.query(
      `UPDATE wallets
       SET available_balance = available_balance - ?,
           exposure_balance = exposure_balance + ?,
           version = version + 1,
           updated_at = NOW()
       WHERE user_id = ?`,
      [stake, stake, userId]
    );

    // 2f. Query authoritative new balance
    const [updatedWalletRows] = await connection.query(
      'SELECT available_balance, exposure_balance, currency FROM wallets WHERE user_id = ?',
      [userId]
    );
    const newWallet = updatedWalletRows[0];

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: `Bet of ₹${stake.toFixed(2)} placed successfully on ${selection}!`,
      data: {
        bet: {
          id: betId,
          matchId: match.id,
          matchTitle: match.match_title,
          selection,
          rate,
          stake,
          potentialReturn,
          potentialProfit: parseFloat((potentialReturn - stake).toFixed(2)),
          status: 'pending'
        },
        wallet: {
          availableBalance: parseFloat(newWallet.available_balance),
          exposureBalance: parseFloat(newWallet.exposure_balance),
          currency: newWallet.currency || 'INR'
        }
      }
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (rbErr) {}
    }
    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

router.post('/place', handlePlaceBet);
router.post('/', handlePlaceBet);

/**
 * POST /api/bets/:betId/cancel (alias: POST /api/bets/cancel)
 * Secure, transactional user wager cancellation before match start.
 * Atomically marks bet as cancelled, releases exposure, refunds stake to available balance,
 * and records immutable ledger record in coin_transactions.
 */
async function handleCancelBet(req, res, next) {
  const pool = getPool();
  let connection = null;

  try {
    const userId = req.user.id;
    const rawBetId = req.params.betId || req.params.id || req.body.betId || req.body.bet_id || req.body.id;
    const betId = rawBetId ? String(rawBetId).trim() : '';

    if (!betId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BET_ID', message: 'Bet identifier is required.' },
        message: 'Bet identifier is required.'
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Lock bet row to inspect current state
    const [betRows] = await connection.query(
      `SELECT id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, refund_amount, cancelled_at
       FROM bets
       WHERE id = ?
       FOR UPDATE`,
      [betId]
    );

    if (betRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'BET_NOT_FOUND', message: 'Bet ticket not found in database.' },
        message: 'Bet ticket not found in database.'
      });
    }

    const bet = betRows[0];

    // 2. Strict ownership verification
    if (bet.user_id !== userId) {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to cancel this bet.' },
        message: 'You are not authorized to cancel this bet.'
      });
    }

    // 3. Verify bet is in a cancellable state
    if (bet.status === 'cancelled' || bet.settlement_status === 'cancelled' || bet.cancelled_at !== null) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_CANCELLED', message: 'This bet has already been cancelled and refunded.' },
        message: 'This bet has already been cancelled and refunded.'
      });
    }

    if (bet.settlement_status === 'settled' || ['won', 'lost', 'no_result'].includes(bet.status)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'BET_ALREADY_SETTLED', message: 'Cannot cancel a bet that has already been settled.' },
        message: 'Cannot cancel a bet that has already been settled.'
      });
    }

    if (bet.status !== 'pending' && bet.status !== 'live') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'BET_NOT_CANCELLABLE', message: `Bet is in "${bet.status}" status and cannot be cancelled.` },
        message: `Bet is in "${bet.status}" status and cannot be cancelled.`
      });
    }

    // 4. Lock match row and strictly evaluate cancellation deadline
    const [matchRows] = await connection.query(
      `SELECT id, match_title, competition, team_one, team_two, scheduled_time, match_start_time, match_end_time, status, settled
       FROM matches
       WHERE id = ?
       FOR UPDATE`,
      [bet.match_id]
    );

    if (matchRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'MATCH_NOT_FOUND', message: 'Associated match fixture not found.' },
        message: 'Associated match fixture not found.'
      });
    }

    const match = matchRows[0];

    // Reject if match is settled
    if (match.settled) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'MATCH_SETTLED', message: 'Cannot cancel bet. Match has already been settled.' },
        message: 'Cannot cancel bet. Match has already been settled.'
      });
    }

    // Reject if match has completed or abandoned
    if (match.status === 'completed' || match.status === 'abandoned') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'MATCH_ENDED', message: `Cannot cancel bet. Match is marked as ${match.status}.` },
        message: `Cannot cancel bet. Match is marked as ${match.status}.`
      });
    }

    // Reject if match is already in progress / started (live)
    if (match.status === 'live') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'MATCH_STARTED', message: 'Cannot cancel bet. The match is already in progress / started.' },
        message: 'Cannot cancel bet. The match is already in progress / started.'
      });
    }

    if (match.status !== 'upcoming') {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        error: { code: 'MATCH_NOT_CANCELLABLE', message: `Cannot cancel bet. Match status is "${match.status}".` },
        message: `Cannot cancel bet. Match status is "${match.status}".`
      });
    }

    const now = Date.now();

    // Reject if scheduled start time has arrived or passed
    if (match.match_start_time) {
      const startTimeMs = new Date(match.match_start_time).getTime();
      if (!isNaN(startTimeMs) && startTimeMs <= now) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: { code: 'MATCH_STARTED', message: 'Cannot cancel bet. The scheduled match start time has passed.' },
          message: 'Cannot cancel bet. The scheduled match start time has passed.'
        });
      }
    }

    // Reject if match expiry has arrived or passed
    if (match.match_end_time) {
      const endTimeMs = new Date(match.match_end_time).getTime();
      if (!isNaN(endTimeMs) && endTimeMs <= now) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: { code: 'MATCH_EXPIRED', message: 'Cannot cancel bet. Match has expired.' },
          message: 'Cannot cancel bet. Match has expired.'
        });
      }
    }

    // 5. Lock player wallet row
    const [walletRows] = await connection.query(
      `SELECT id, user_id, available_balance, exposure_balance, version
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (walletRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        error: { code: 'WALLET_NOT_FOUND', message: 'Player wallet record not found.' },
        message: 'Player wallet record not found.'
      });
    }

    const wallet = walletRows[0];
    const refundStake = parseFloat(bet.stake);
    const balanceBefore = parseFloat(wallet.available_balance || 0);
    const balanceAfter = parseFloat((balanceBefore + refundStake).toFixed(2));

    // 6. Transition bet status from pending to cancelled
    const [updateBetResult] = await connection.query(
      `UPDATE bets
       SET status = 'cancelled',
           settlement_status = 'cancelled',
           refund_amount = ?,
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = ? AND status IN ('pending', 'live') AND settlement_status = 'pending'`,
      [refundStake, bet.id]
    );

    if (updateBetResult.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        error: { code: 'CONCURRENT_MODIFICATION', message: 'Bet state changed during processing. Please refresh and try again.' },
        message: 'Bet state changed during processing. Please refresh and try again.'
      });
    }

    // 7. Atomically refund stake to available balance and release exposure
    await connection.query(
      `UPDATE wallets
       SET available_balance = available_balance + ?,
           exposure_balance = GREATEST(0.00, exposure_balance - ?),
           version = version + 1,
           updated_at = NOW()
       WHERE user_id = ?`,
      [refundStake, refundStake, userId]
    );

    // 8. Record audit ledger entry in coin_transactions
    const crypto = require('crypto');
    const txnUuid = crypto.randomUUID();
    const idempotencyKey = `REFUND-BET-${bet.id}`;

    await connection.query(
      `INSERT INTO coin_transactions (
        transaction_uuid, user_id, username, admin_id, admin_username,
        action_type, amount, balance_before, balance_after,
        reason, idempotency_key, status, created_at
      ) VALUES (?, ?, ?, NULL, NULL, 'BET_CANCEL_REFUND', ?, ?, ?, ?, ?, 'completed', NOW())`,
      [
        txnUuid,
        userId,
        req.user.username,
        refundStake,
        balanceBefore,
        balanceAfter,
        `Bet Cancellation Refund: ${bet.id} (${bet.selection} - ₹${refundStake.toFixed(2)})`,
        idempotencyKey
      ]
    );

    // 9. Fetch authoritative updated wallet balance
    const [updatedWalletRows] = await connection.query(
      'SELECT available_balance, exposure_balance, currency FROM wallets WHERE user_id = ?',
      [userId]
    );
    const newWallet = updatedWalletRows[0];

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: 'Bet cancelled successfully. Your stake has been refunded.',
      bet: {
        id: bet.id,
        status: 'cancelled',
        settlementStatus: 'cancelled'
      },
      refundedAmount: refundStake,
      balance: parseFloat(newWallet.available_balance),
      data: {
        bet: {
          id: bet.id,
          matchId: match.id,
          matchTitle: match.match_title,
          selection: bet.selection,
          stake: refundStake,
          status: 'cancelled',
          settlementStatus: 'cancelled',
          refundAmount: refundStake,
          cancelledAt: new Date().toISOString()
        },
        refundedAmount: refundStake,
        wallet: {
          availableBalance: parseFloat(newWallet.available_balance),
          exposureBalance: parseFloat(newWallet.exposure_balance),
          currency: newWallet.currency || 'INR'
        }
      }
    });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (rbErr) {}
    }
    next(err);
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

router.post('/:betId/cancel', handleCancelBet);
router.post('/cancel', handleCancelBet);

module.exports = router;

