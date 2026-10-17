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
        COALESCE(SUM(CASE WHEN status = 'lost' THEN stake ELSE 0 END), 0) AS lostStake
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
      lostStake: parseFloat(metricsRow.lostStake || 0)
    };

    // 2. Build parameterized query for the player's bet records
    const whereClauses = ['b.user_id = ?'];
    const queryParams = [userId];

    if (filter !== 'all') {
      if (filter === 'live') {
        whereClauses.push("(b.status = 'live' OR b.status = 'pending')");
      } else if (['won', 'lost', 'no_result'].includes(filter)) {
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
        b.settled_at,
        b.created_at,
        COALESCE(m.match_title, 'Match Fixture') AS match_title,
        COALESCE(m.competition, 'Cricket Tournament') AS competition,
        COALESCE(m.team_one, 'Team One') AS team_one,
        m.team_one_logo,
        COALESCE(m.team_two, 'Team Two') AS team_two,
        m.team_two_logo,
        m.status AS match_status,
        m.toss_winner
       FROM bets b
       LEFT JOIN matches m ON m.id = b.match_id
       ${whereSql}
       ORDER BY b.created_at DESC`,
      queryParams
    );

    const bets = rows.map((r) => {
      let resultText = 'Awaiting match toss declaration';
      if (r.status === 'won') {
        resultText = `${r.selection} won the toss. Settlement credited to balance.`;
      } else if (r.status === 'lost') {
        resultText = `${r.toss_winner ? r.toss_winner : 'Opponent'} won the toss.`;
      } else if (r.status === 'no_result') {
        resultText = 'Match abandoned / no result. Stake refunded.';
      }

      let selectedTeamLogo = null;
      if (r.selection === r.team_one) selectedTeamLogo = r.team_one_logo;
      else if (r.selection === r.team_two) selectedTeamLogo = r.team_two_logo;

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
        resultText,
        placedAt: r.created_at,
        settledAt: r.settled_at
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

module.exports = router;

