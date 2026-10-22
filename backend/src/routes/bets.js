/**
 * IRONMAN TOSS BOOK - Player Bets API Router
 * Returns authentic wager history and calculated metrics directly from MySQL for the authenticated player.
 */

const express = require('express');
const { getPool } = require('../config/db');
const { authenticate, enforcePasswordChange } = require('../middleware/auth');
const {
  reserveIdempotencyKey,
  completeIdempotencyKey,
  releaseIdempotencyKey,
  executeWithRetry,
  sanitizeKey
} = require('../utils/idempotency');
const {
  parseUtcTimestamp,
  isMatchSettled,
  isMatchConcluded
} = require('../utils/dateTime');
const walletService = require('../services/walletService');

const router = express.Router();

// Enforce authentication & mandatory password change guard on player betting endpoints
router.use(authenticate);
router.use(enforcePasswordChange);

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
      // A pending bet is cancellable before the match ends / is settled:
      // 1. Bet must be pending/live and unsettled
      // 2. Match must not be settled (match_settled == 0)
      // 3. Match status must not be completed, abandoned, or closed
      // 4. Match start time (if set) must not have passed
      // 5. Match end time (if set) must not have passed
      const isPending = (r.status === 'pending' || r.status === 'live');
      const isUnsettled = (r.settlement_status === 'pending') && !isMatchSettled(r.match_settled);
      const isNotClosed = !isMatchConcluded(r.match_status);
      const isStartTimeFuture = !r.match_start_time || (parseUtcTimestamp(r.match_start_time) > now);
      const isEndTimeFuture = !r.match_end_time || (parseUtcTimestamp(r.match_end_time) > now);

      const canCancel = Boolean(isPending && isUnsettled && isNotClosed && isStartTimeFuture && isEndTimeFuture);

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
 * GET /api/bets/my-active-bets
 * Returns the authenticated user's current eligible active bets with associated match metadata.
 * Excludes cancelled, settled, and concluded match bets.
 */
router.get('/my-active-bets', async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const now = Date.now();

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
        b.created_at,
        COALESCE(m.match_title, 'Match Fixture') AS match_title,
        COALESCE(m.competition, 'Cricket Tournament') AS competition,
        COALESCE(m.team_one, 'Team One') AS team_one,
        m.team_one_abbr,
        m.team_one_rate,
        m.team_one_logo,
        COALESCE(m.team_two, 'Team Two') AS team_two,
        m.team_two_abbr,
        m.team_two_rate,
        m.team_two_logo,
        m.status AS match_status,
        m.settled AS match_settled,
        m.match_start_time,
        m.match_end_time,
        m.scheduled_time,
        m.venue
       FROM bets b
       JOIN matches m ON m.id = b.match_id
       WHERE b.user_id = ?
         AND b.status IN ('pending', 'live')
         AND b.settlement_status = 'pending'
         AND (m.settled = 0 OR m.settled IS NULL)
         AND m.status NOT IN ('completed', 'abandoned', 'closed')
       ORDER BY b.created_at DESC`,
      [userId]
    );

    const activeBets = rows.map((r) => {
      let selectedTeamLogo = null;
      let selectionRate = r.odds;
      if (r.selection === r.team_one) {
        selectedTeamLogo = r.team_one_logo;
        selectionRate = r.team_one_rate || r.odds;
      } else if (r.selection === r.team_two) {
        selectedTeamLogo = r.team_two_logo;
        selectionRate = r.team_two_rate || r.odds;
      }

      // Cancellation eligibility checks:
      const isPending = (r.status === 'pending' || r.status === 'live');
      const isUnsettled = (r.settlement_status === 'pending') && !isMatchSettled(r.match_settled);
      const isNotClosed = !isMatchConcluded(r.match_status);
      const isStartTimeFuture = !r.match_start_time || (parseUtcTimestamp(r.match_start_time) > now);
      const isEndTimeFuture = !r.match_end_time || (parseUtcTimestamp(r.match_end_time) > now);

      const canCancel = Boolean(isPending && isUnsettled && isNotClosed && isStartTimeFuture && isEndTimeFuture);

      const stakeNum = parseFloat(r.stake);
      const rateNum = parseFloat(selectionRate || r.odds);
      const potReturn = parseFloat(r.potential_return || (stakeNum * rateNum).toFixed(2));
      const potProfit = Math.max(0, parseFloat((potReturn - stakeNum).toFixed(2)));

      return {
        id: r.id,
        betId: r.id,
        matchId: r.match_id,
        competition: r.competition,
        matchTitle: r.match_title,
        sport: 'CRICKET',
        teamOne: r.team_one,
        teamOneAbbr: r.team_one_abbr || r.team_one.substring(0, 4).toUpperCase(),
        teamOneLogo: r.team_one_logo || null,
        teamOneRate: parseFloat(r.team_one_rate || r.odds),
        teamTwo: r.team_two,
        teamTwoAbbr: r.team_two_abbr || r.team_two.substring(0, 4).toUpperCase(),
        teamTwoLogo: r.team_two_logo || null,
        teamTwoRate: parseFloat(r.team_two_rate || r.odds),
        selection: r.selection,
        selectedTeam: r.selection,
        selectedTeamLogo,
        stake: stakeNum,
        rate: rateNum,
        odds: rateNum,
        potentialReturn: potReturn,
        potentialProfit: potProfit,
        status: r.status,
        settlementStatus: r.settlement_status,
        matchStatus: r.match_status,
        scheduledTime: r.scheduled_time,
        matchStartTime: r.match_start_time,
        matchEndTime: r.match_end_time,
        venue: r.venue,
        canCancel,
        placedAt: r.created_at
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        activeBets,
        count: activeBets.length
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
  const userId = req.user.id;
  const rawMatchId = req.body.matchId !== undefined ? String(req.body.matchId) : (req.body.match_id !== undefined ? String(req.body.match_id) : '');
  const rawSelection = req.body.selection || req.body.selectedTeam || req.body.team;
  const rawStake = req.body.stake !== undefined ? req.body.stake : req.body.amount;
  const rawIdempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey || req.body.idempotency_key;

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
  if (stakeStr === '' || stakeStr === 'null' || stakeStr === 'undefined' || !/^-?\d+(\.\d+)?$/.test(stakeStr)) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STAKE', message: 'Please enter a valid stake amount.' },
      message: 'Please enter a valid stake amount.'
    });
  }

  const stakeNum = Number(stakeStr);
  if (isNaN(stakeNum) || !Number.isFinite(stakeNum) || stakeNum <= 0) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STAKE', message: 'Stake amount must be a positive number greater than 0.' },
      message: 'Stake amount must be a positive number greater than 0.'
    });
  }

  const decimalParts = stakeStr.split('.');
  if (decimalParts.length === 2 && decimalParts[1].length > 2) {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_STAKE_PRECISION', message: 'Stake amount cannot have more than 2 decimal places.' },
      message: 'Stake amount cannot have more than 2 decimal places.'
    });
  }

  if (stakeNum < 50) {
    return res.status(400).json({
      success: false,
      error: { code: 'MIN_STAKE_ERROR', message: 'Minimum stake amount is ₹50.' },
      message: 'Minimum stake amount is ₹50.'
    });
  }

  if (stakeNum > 100000) {
    return res.status(400).json({
      success: false,
      error: { code: 'MAX_STAKE_ERROR', message: 'Maximum stake amount is ₹100,000.' },
      message: 'Maximum stake amount is ₹100,000.'
    });
  }

  const stake = parseFloat(stakeNum.toFixed(2));
  const cleanIdempotencyKey = sanitizeKey(rawIdempotencyKey);

  try {
    const result = await executeWithRetry(async () => {
      let connection = null;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Check/reserve idempotency key
        if (cleanIdempotencyKey) {
          const idemResult = await reserveIdempotencyKey(connection, {
            key: cleanIdempotencyKey,
            userId,
            scope: 'BET_PLACE',
            payload: { matchId, selection, stake }
          });

          if (idemResult.mismatch) {
            await connection.rollback();
            return {
              httpStatus: 422,
              body: {
                success: false,
                error: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', message: idemResult.message }
              }
            };
          }

          if (idemResult.isProcessing) {
            await connection.rollback();
            return {
              httpStatus: 409,
              body: {
                success: false,
                error: { code: 'CONCURRENT_REQUEST', message: idemResult.message }
              }
            };
          }

          if (idemResult.isRetry && idemResult.cachedResponse) {
            await connection.rollback();
            return {
              httpStatus: idemResult.cachedResponse.status,
              body: idemResult.cachedResponse.body
            };
          }
        }

        // 1. Verify user account status
        const [userRows] = await connection.query(
          'SELECT id, username, status, role FROM users WHERE id = ? FOR UPDATE',
          [userId]
        );

        if (userRows.length === 0) {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'USER_NOT_FOUND', message: 'User account not found.' } }
          };
        }

        const userRec = userRows[0];
        if (userRec.status !== 'active') {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 403,
            body: {
              success: false,
              error: {
                code: userRec.status === 'banned' ? 'USER_BANNED' : 'USER_SUSPENDED',
                message: `Your account is ${userRec.status}. Betting operations are disabled.`
              }
            }
          };
        }

        // Lock ordering: 1. match, 2. wallet
        const [matchRows] = await connection.query(
          'SELECT id, match_title, competition, team_one, team_one_rate, team_two, team_two_rate, status, settled, match_start_time, match_end_time FROM matches WHERE id = ? FOR UPDATE',
          [matchId]
        );

        if (matchRows.length === 0) {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Match fixture not found in database.' } }
          };
        }

        const match = matchRows[0];

        const isSettled = isMatchSettled(match.settled);
        const isConcluded = isMatchConcluded(match.status);

        if (isSettled || isConcluded) {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'BETTING_CLOSED', message: 'Betting on this match is closed.' } }
          };
        }

        const now = Date.now();

        // Strict cutoff checks:
        // 1. If match is in 'upcoming' status and match start time has passed
        if (match.status === 'upcoming' && match.match_start_time) {
          const matchStartTimeMs = parseUtcTimestamp(match.match_start_time);
          if (matchStartTimeMs && matchStartTimeMs <= now) {
            await connection.rollback();
            if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
            return {
              httpStatus: 400,
              body: { success: false, error: { code: 'MATCH_STARTED', message: 'The match has already started. Betting cutoff has passed.' } }
            };
          }
        }

        // 2. Strict match end / auto-expiry cutoff (applies to both upcoming and live matches)
        if (match.match_end_time) {
          const matchEndTimeMs = parseUtcTimestamp(match.match_end_time);
          if (matchEndTimeMs && matchEndTimeMs <= now) {
            await connection.rollback();
            if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
            return {
              httpStatus: 400,
              body: { success: false, error: { code: 'MATCH_EXPIRED', message: 'This match has expired and betting is closed.' } }
            };
          }
        }

        let rate = 0;
        if (selection.toLowerCase() === match.team_one.toLowerCase()) {
          rate = parseFloat(match.team_one_rate || 1.90);
        } else if (selection.toLowerCase() === match.team_two.toLowerCase()) {
          rate = parseFloat(match.team_two_rate || 1.90);
        } else {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 400,
            body: {
              success: false,
              error: {
                code: 'INVALID_TEAM_SELECTION',
                message: `Selection "${selection}" is invalid. Must choose either "${match.team_one}" or "${match.team_two}".`
              }
            }
          };
        }

        // Lock wallet
        const [walletRows] = await connection.query(
          'SELECT id, available_balance, exposure_balance, currency, version FROM wallets WHERE user_id = ? FOR UPDATE',
          [userId]
        );

        if (walletRows.length === 0) {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'WALLET_NOT_FOUND', message: 'Player wallet record not found.' } }
          };
        }

        const wallet = walletRows[0];
        const availableBalance = parseFloat(wallet.available_balance || 0);

        if (availableBalance < stake) {
          await connection.rollback();
          if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
          return {
            httpStatus: 400,
            body: {
              success: false,
              error: {
                code: 'INSUFFICIENT_BALANCE',
                message: `Insufficient available balance. Required: ₹${stake.toFixed(2)}, Available: ₹${availableBalance.toFixed(2)}.`
              }
            }
          };
        }

        // Calculate potential return & profit
        const potentialReturn = parseFloat((stake * rate).toFixed(2));
        const betId = `BET-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

        // Insert Bet Ticket with authoritative idempotency_key
        try {
          await connection.query(
            `INSERT INTO bets (
              id, user_id, match_id, market_name, selection,
              stake, odds, potential_return, status, settlement_status,
              idempotency_key, payout, settled_at, settled_by, created_at, updated_at
            ) VALUES (?, ?, ?, 'Toss Winner', ?, ?, ?, ?, 'pending', 'pending', ?, 0.00, NULL, NULL, NOW(), NOW())`,
            [betId, userId, match.id, selection, stake, rate, potentialReturn, cleanIdempotencyKey]
          );
        } catch (insertBetErr) {
          if (insertBetErr.code === 'ER_DUP_ENTRY' || insertBetErr.errno === 1062) {
            await connection.rollback();
            if (cleanIdempotencyKey) await releaseIdempotencyKey(pool, cleanIdempotencyKey);
            return {
              httpStatus: 409,
              body: {
                success: false,
                error: {
                  code: 'DUPLICATE_BET_REJECTED',
                  message: 'A bet with this idempotency key has already been placed.'
                }
              }
            };
          }
          throw insertBetErr;
        }

        // Deduct stake and record ledger entry atomically via centralized walletService
        const debitResult = await walletService.placeBetDebit({
          userId,
          username: req.user.username,
          matchId: match.id,
          betId,
          stake,
          idempotencyKey: cleanIdempotencyKey ? `STAKE-${cleanIdempotencyKey}` : `STAKE-${betId}`,
          reason: `Bet Placed: ${betId} on ${match.match_title} (${selection} @ ₹${stake.toFixed(2)})`,
          connection
        });

        const newWallet = {
          available_balance: debitResult.availableBalance,
          exposure_balance: debitResult.exposureBalance,
          currency: wallet.currency || 'INR'
        };

        const responsePayload = {
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
        };

        if (cleanIdempotencyKey) {
          await completeIdempotencyKey(connection, {
            key: cleanIdempotencyKey,
            responseStatus: 201,
            responseBody: responsePayload
          });
        }

        await connection.commit();
        return { httpStatus: 201, body: responsePayload };
      } catch (innerErr) {
        if (connection) {
          try { await connection.rollback(); } catch (rbErr) {}
        }
        if (cleanIdempotencyKey) {
          await releaseIdempotencyKey(pool, cleanIdempotencyKey);
        }
        throw innerErr;
      } finally {
        if (connection) {
          connection.release();
        }
      }
    });

    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    console.error(`[BET PLACEMENT FAILURE] matchId: ${matchId}, userId: ${userId}, selection: ${selection}, stake: ${stake}:`, err.message);
    if (err.stack) {
      console.error('[BET PLACEMENT STACK]:', err.stack);
    }
    next(err);
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

  const clientKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'] || req.body.idempotencyKey || req.body.idempotency_key;
  const cancelIdempotencyKey = sanitizeKey(clientKey);

  try {
    const result = await executeWithRetry(async () => {
      let connection = null;
      try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Check/reserve idempotency key
        const idemResult = await reserveIdempotencyKey(connection, {
          key: cancelIdempotencyKey,
          userId,
          scope: 'BET_CANCEL',
          payload: { betId }
        });

        if (idemResult.mismatch) {
          await connection.rollback();
          return {
            httpStatus: 422,
            body: { success: false, error: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH', message: idemResult.message } }
          };
        }

        if (idemResult.isProcessing) {
          await connection.rollback();
          return {
            httpStatus: 409,
            body: { success: false, error: { code: 'CONCURRENT_REQUEST', message: idemResult.message } }
          };
        }

        if (idemResult.isRetry && idemResult.cachedResponse) {
          await connection.rollback();
          return {
            httpStatus: idemResult.cachedResponse.status,
            body: idemResult.cachedResponse.body
          };
        }

        // 0. Verify user account status
        const [userRows] = await connection.query(
          'SELECT id, username, status, role FROM users WHERE id = ? FOR UPDATE',
          [userId]
        );

        if (userRows.length === 0) {
          await connection.rollback();
          if (cancelIdempotencyKey) await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'USER_NOT_FOUND', message: 'User account not found.' } }
          };
        }

        const userRec = userRows[0];
        if (userRec.status !== 'active') {
          await connection.rollback();
          if (cancelIdempotencyKey) await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 403,
            body: {
              success: false,
              error: {
                code: userRec.status === 'banned' ? 'USER_BANNED' : 'USER_SUSPENDED',
                message: `Your account is ${userRec.status}. Betting operations are disabled.`
              }
            }
          };
        }

        // Lock ordering: 1. match, 2. bet, 3. wallet
        const [betRows] = await connection.query(
          `SELECT id, user_id, match_id, market_name, selection, stake, odds, potential_return, status, settlement_status, payout, refund_amount, cancelled_at
           FROM bets
           WHERE id = ?
           FOR UPDATE`,
          [betId]
        );

        if (betRows.length === 0) {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'BET_NOT_FOUND', message: 'Bet ticket not found in database.' }, message: 'Bet ticket not found in database.' }
          };
        }

        const bet = betRows[0];

        // 2. Strict ownership verification
        if (bet.user_id !== userId) {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 403,
            body: { success: false, error: { code: 'FORBIDDEN', message: 'You are not authorized to cancel this bet.' }, message: 'You are not authorized to cancel this bet.' }
          };
        }

        // 3. Verify bet is in a cancellable state
        if (bet.status === 'cancelled' || bet.settlement_status === 'cancelled' || bet.cancelled_at !== null) {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'ALREADY_CANCELLED', message: 'This bet has already been cancelled and refunded.' }, message: 'This bet has already been cancelled and refunded.' }
          };
        }

        if (bet.settlement_status === 'settled' || ['won', 'lost', 'no_result'].includes(bet.status)) {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'BET_ALREADY_SETTLED', message: 'Cannot cancel a bet that has already been settled.' }, message: 'Cannot cancel a bet that has already been settled.' }
          };
        }

        if (bet.status !== 'pending' && bet.status !== 'live') {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'BET_NOT_CANCELLABLE', message: `Bet is in "${bet.status}" status and cannot be cancelled.` }, message: `Bet is in "${bet.status}" status and cannot be cancelled.` }
          };
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
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'MATCH_NOT_FOUND', message: 'Associated match fixture not found.' }, message: 'Associated match fixture not found.' }
          };
        }

        const match = matchRows[0];

        // Reject if match is settled
        if (isMatchSettled(match.settled)) {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'MATCH_SETTLED', message: 'Cannot cancel bet. Match has already been settled.' }, message: 'Cannot cancel bet. Match has already been settled.' }
          };
        }

        // Reject if match has completed or abandoned
        if (isMatchConcluded(match.status)) {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'MATCH_ENDED', message: `Cannot cancel bet. Match is marked as ${match.status}.` }, message: `Cannot cancel bet. Match is marked as ${match.status}.` }
          };
        }

        const now = Date.now();

        // Reject cancellation if match is live (live toss underway)
        if (match.status === 'live') {
          await connection.rollback();
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 400,
            body: { success: false, error: { code: 'MATCH_STARTED', message: 'Cannot cancel bet. The match is already live.' }, message: 'Cannot cancel bet. The match is already live.' }
          };
        }

        // Reject if scheduled start time has arrived or passed
        if (match.match_start_time) {
          const startTimeMs = parseUtcTimestamp(match.match_start_time);
          if (startTimeMs && startTimeMs <= now) {
            await connection.rollback();
            await releaseIdempotencyKey(pool, cancelIdempotencyKey);
            return {
              httpStatus: 400,
              body: { success: false, error: { code: 'MATCH_STARTED', message: 'Cannot cancel bet. The scheduled match start time has passed.' }, message: 'Cannot cancel bet. The scheduled match start time has passed.' }
            };
          }
        }

        // Reject if match expiry has arrived or passed
        if (match.match_end_time) {
          const endTimeMs = parseUtcTimestamp(match.match_end_time);
          if (endTimeMs && endTimeMs <= now) {
            await connection.rollback();
            await releaseIdempotencyKey(pool, cancelIdempotencyKey);
            return {
              httpStatus: 400,
              body: { success: false, error: { code: 'MATCH_EXPIRED', message: 'Cannot cancel bet. Match has expired.' }, message: 'Cannot cancel bet. Match has expired.' }
            };
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
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 404,
            body: { success: false, error: { code: 'WALLET_NOT_FOUND', message: 'Player wallet record not found.' }, message: 'Player wallet record not found.' }
          };
        }

        const wallet = walletRows[0];
        const refundStake = parseFloat(bet.stake);
        const balanceBefore = parseFloat(wallet.available_balance || 0);
        const balanceAfter = parseFloat((balanceBefore + refundStake).toFixed(2));

        // 6. Transition bet status from pending to cancelled atomically
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
          await releaseIdempotencyKey(pool, cancelIdempotencyKey);
          return {
            httpStatus: 409,
            body: { success: false, error: { code: 'CONCURRENT_MODIFICATION', message: 'Bet state changed during processing. Please refresh and try again.' }, message: 'Bet state changed during processing. Please refresh and try again.' }
          };
        }

        // 7. Atomically refund stake and record ledger entry via centralized walletService
        const refundResult = await walletService.refundCancelledBet({
          userId,
          username: req.user.username,
          matchId: match.id,
          betId: bet.id,
          stake: refundStake,
          idempotencyKey: cancelIdempotencyKey,
          reason: `Bet Cancellation Refund: ${bet.id} (${bet.selection} - ₹${refundStake.toFixed(2)})`,
          connection
        });

        const newWallet = {
          available_balance: refundResult.availableBalance,
          exposure_balance: refundResult.exposureBalance,
          currency: wallet.currency || 'INR'
        };

        const responsePayload = {
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
        };

        await completeIdempotencyKey(connection, {
          key: cancelIdempotencyKey,
          responseStatus: 200,
          responseBody: responsePayload
        });

        await connection.commit();
        return { httpStatus: 200, body: responsePayload };
      } catch (innerErr) {
        if (connection) {
          try { await connection.rollback(); } catch (rbErr) {}
        }
        await releaseIdempotencyKey(pool, cancelIdempotencyKey);
        throw innerErr;
      } finally {
        if (connection) {
          connection.release();
        }
      }
    });

    return res.status(result.httpStatus).json(result.body);
  } catch (err) {
    next(err);
  }
}

router.post('/:betId/cancel', handleCancelBet);
router.post('/cancel', handleCancelBet);

/**
 * GET /api/bets/:betId
 * Returns details of an individual bet ticket with strict ownership enforcement.
 */
router.get('/:betId', async (req, res, next) => {
  try {
    const pool = getPool();
    const userId = req.user.id;
    const betId = (req.params.betId || '').trim();

    if (!betId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_BET_ID', message: 'Bet identifier is required.' }
      });
    }

    const [rows] = await pool.query(
      `SELECT
        b.id,
        b.user_id,
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
        m.match_title,
        m.competition,
        m.team_one,
        m.team_one_logo,
        m.team_two,
        m.team_two_logo,
        m.status AS match_status,
        m.settled AS match_settled,
        m.match_start_time,
        m.match_end_time,
        m.toss_winner
       FROM bets b
       LEFT JOIN matches m ON m.id = b.match_id
       WHERE b.id = ? LIMIT 1`,
      [betId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'BET_NOT_FOUND', message: 'Bet ticket not found in database.' }
      });
    }

    const bet = rows[0];

    // Strict ownership verification: only the owner or an admin may view this ticket
    if (bet.user_id !== userId && req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not authorized to view this bet ticket.' }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: bet.id,
        matchId: bet.match_id,
        matchTitle: bet.match_title,
        competition: bet.competition,
        selection: bet.selection,
        stake: parseFloat(bet.stake),
        odds: parseFloat(bet.odds),
        rate: parseFloat(bet.odds),
        potentialReturn: parseFloat(bet.potential_return),
        status: bet.status,
        settlementStatus: bet.settlement_status,
        payout: parseFloat(bet.payout || 0),
        refundAmount: parseFloat(bet.refund_amount || 0),
        placedAt: bet.created_at,
        settledAt: bet.settled_at,
        cancelledAt: bet.cancelled_at
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Phase 3.1: Immutable Bet Selection and Stake
 * Explicitly reject any attempts to update, modify, or tamper with bets post-placement.
 */
function rejectBetModification(req, res) {
  return res.status(405).json({
    success: false,
    error: {
      code: 'BET_IMMUTABLE',
      message: 'Bet wagers cannot be altered or modified once placed. Stake, selection, and odds are permanently immutable.'
    }
  });
}

router.put('/:betId', rejectBetModification);
router.patch('/:betId', rejectBetModification);
router.delete('/:betId', rejectBetModification);
router.put('/', rejectBetModification);
router.patch('/', rejectBetModification);

module.exports = router;

