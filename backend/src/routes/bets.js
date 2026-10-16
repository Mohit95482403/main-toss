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
        COALESCE(m.team_two, 'Team Two') AS team_two,
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

      return {
        id: r.id,
        matchId: r.match_id,
        competition: r.competition,
        matchTitle: r.match_title,
        teamOne: r.team_one,
        teamTwo: r.team_two,
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

module.exports = router;
