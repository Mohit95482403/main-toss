/**
 * IRONMAN TOSS BOOK - Public Matches API Router
 * Retrieves authentic match fixtures, toss odds, and categories directly from MySQL database.
 */

const express = require('express');
const { getPool } = require('../config/db');

const router = express.Router();

/**
 * GET /api/matches
 * Returns authentic sporting fixtures from MySQL database with category filtering and dynamic counts.
 */
router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const category = (req.query.category || 'all').trim().toLowerCase();
    const search = (req.query.search || '').trim();

    // 1. Concurrently calculate real-time category counts from MySQL
    const [[countsRow]] = await pool.query(`
      SELECT
        COUNT(*) AS totalAll,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) AS totalLive,
        SUM(CASE WHEN status = 'upcoming' THEN 1 ELSE 0 END) AS totalUpcoming,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS totalCompleted
      FROM matches
    `);

    const counts = {
      all: parseInt(countsRow.totalAll || 0, 10),
      live: parseInt(countsRow.totalLive || 0, 10),
      upcoming: parseInt(countsRow.totalUpcoming || 0, 10),
      completed: parseInt(countsRow.totalCompleted || 0, 10)
    };

    // 2. Build parameterized query for fixtures
    const whereClauses = [];
    const queryParams = [];

    if (category !== 'all' && ['live', 'upcoming', 'completed'].includes(category)) {
      whereClauses.push('status = ?');
      queryParams.push(category);
    }

    if (search.length > 0) {
      whereClauses.push('(match_title LIKE ? OR competition LIKE ? OR team_one LIKE ? OR team_two LIKE ?)');
      const pattern = `%${search}%`;
      queryParams.push(pattern, pattern, pattern, pattern);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT
        id,
        competition,
        stage,
        match_title,
        team_one,
        team_one_abbr,
        team_one_rate,
        team_two,
        team_two_abbr,
        team_two_rate,
        scheduled_time,
        venue,
        status,
        toss_winner,
        settled,
        settled_at,
        created_at
       FROM matches
       ${whereSql}
       ORDER BY
         CASE WHEN status = 'live' THEN 1 WHEN status = 'upcoming' THEN 2 ELSE 3 END,
         created_at DESC`,
      queryParams
    );

    const matches = rows.map((m) => ({
      id: m.id,
      competition: m.competition,
      stage: m.stage || 'Fixture',
      matchTitle: m.match_title,
      teamOne: m.team_one,
      teamOneAbbr: m.team_one_abbr || m.team_one.substring(0, 3).toUpperCase(),
      teamOneRate: parseFloat(m.team_one_rate || 1.90),
      teamTwo: m.team_two,
      teamTwoAbbr: m.team_two_abbr || m.team_two.substring(0, 3).toUpperCase(),
      teamTwoRate: parseFloat(m.team_two_rate || 1.90),
      scheduledTime: m.scheduled_time || 'Schedule TBA',
      venue: m.venue || 'Venue TBA',
      status: m.status,
      tossWinner: m.toss_winner,
      settled: Boolean(m.settled),
      settledAt: m.settled_at,
      createdAt: m.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        matches,
        counts
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/matches/:id
 * Retrieves single match fixture by ID directly from MySQL.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const matchId = (req.params.id || '').trim();
    if (!matchId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Match identifier is required.' }
      });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT
        id, competition, stage, match_title, team_one, team_one_abbr, team_one_rate,
        team_two, team_two_abbr, team_two_rate, scheduled_time, venue, status,
        toss_winner, settled, settled_at, created_at
       FROM matches
       WHERE id = ?
       LIMIT 1`,
      [matchId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Match fixture not found in database.' }
      });
    }

    const m = rows[0];
    return res.status(200).json({
      success: true,
      data: {
        id: m.id,
        competition: m.competition,
        stage: m.stage || 'Fixture',
        matchTitle: m.match_title,
        teamOne: m.team_one,
        teamOneAbbr: m.team_one_abbr || m.team_one.substring(0, 3).toUpperCase(),
        teamOneRate: parseFloat(m.team_one_rate || 1.90),
        teamTwo: m.team_two,
        teamTwoAbbr: m.team_two_abbr || m.team_two.substring(0, 3).toUpperCase(),
        teamTwoRate: parseFloat(m.team_two_rate || 1.90),
        scheduledTime: m.scheduled_time || 'Schedule TBA',
        venue: m.venue || 'Venue TBA',
        status: m.status,
        tossWinner: m.toss_winner,
        settled: Boolean(m.settled),
        settledAt: m.settled_at,
        createdAt: m.created_at
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
