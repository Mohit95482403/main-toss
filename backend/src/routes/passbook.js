/**
 * IRONMAN TOSS BOOK - Player Passbook & Financial Ledger Router
 * Returns authentic transaction ledger records and wallet balances from MySQL for the authenticated player.
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const walletService = require('../services/walletService');

const router = express.Router();

// Enforce authentication on passbook endpoints
router.use(authenticate);

/**
 * GET /api/passbook/transactions
 * Returns genuine transactions from coin_transactions and wallet balances directly via walletService.
 */
router.get('/transactions', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const typeFilter = (req.query.type || 'all').trim().toLowerCase();
    const search = (req.query.search || '').trim();
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 50, 10);

    const result = await walletService.getWalletTransactions(userId, {
      type: typeFilter,
      search,
      page,
      limit
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
