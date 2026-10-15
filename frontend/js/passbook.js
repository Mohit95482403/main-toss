/**
 * IRONMAN TOSS BOOK - Passbook Controller & Ledger Feed (Day 10 Enhanced)
 * Handles client-side demonstration ledger data, dynamic balance derivation, search filtering,
 * credit/debit classification, status filtering, accessible transaction details modal, and balance sync.
 */

(function () {
  'use strict';

  // SVGs for Ledger UI, Badges, Search, and Modals
  const ICONS = {
    credit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`,
    debit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="17" y1="7" x2="7" y2="17"></line><polyline points="17 17 7 17 7 7"></polyline></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
    clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    empty: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M7 10h10M7 14h6"></path></svg>`,
    deposit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    withdraw: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
    arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>`
  };

  /**
   * Demonstration Transaction History Records
   * Strictly identified fictional records matching reference screenshot patterns.
   * Mathematical Consistency:
   * Total Credits: ₹5,000 + ₹2,000 + ₹3,000 + ₹5,000 = ₹15,000.00
   * Total Debits:  ₹1,000 + ₹500 + ₹3,500 = ₹5,000.00
   * Available Net: ₹15,000.00 - ₹5,000.00 = ₹10,000.00
   */
  const DEMO_TRANSACTIONS = [
    {
      id: 'DEMO-TXN-001',
      title: 'Account Credit',
      subtitle: 'Instant UPI Wallet Top-up',
      type: 'credit', // 'credit' | 'debit'
      amount: 5000.00,
      timestamp: '2026-10-12T10:30:00Z',
      dateFormatted: '12 Oct 2026',
      timeFormatted: '10:30 AM',
      status: 'completed', // 'completed' | 'pending' | 'failed'
      closingBalance: 10000.00,
      category: 'Deposit',
      paymentMethod: 'Instant UPI (Demo)',
      referenceCode: 'UPI-20261012-9841',
      remarks: 'Simulated UPI fund deposit via Axis Bank NetBanking gateway'
    },
    {
      id: 'DEMO-TXN-002',
      title: 'Account Debit',
      subtitle: 'Toss Stake: India vs Australia',
      type: 'debit',
      amount: 1000.00,
      timestamp: '2026-10-11T16:15:00Z',
      dateFormatted: '11 Oct 2026',
      timeFormatted: '04:15 PM',
      status: 'completed',
      closingBalance: 5000.00,
      category: 'Wager Stake',
      paymentMethod: 'Wager Settlement',
      referenceCode: 'TOSS-BET-1048-STAKE',
      remarks: 'Toss winner selection stake debited for India vs Australia T20 fixture'
    },
    {
      id: 'DEMO-TXN-003',
      title: 'Account Credit',
      subtitle: 'Toss Winnings: MI vs CSK',
      type: 'credit',
      amount: 2000.00,
      timestamp: '2026-10-10T12:20:00Z',
      dateFormatted: '10 Oct 2026',
      timeFormatted: '12:20 PM',
      status: 'completed',
      closingBalance: 6000.00,
      category: 'Wager Win',
      paymentMethod: 'Wager Settlement',
      referenceCode: 'TOSS-BET-1048-WIN',
      remarks: 'Settlement payout credited for Mumbai Indians toss declaration'
    },
    {
      id: 'DEMO-TXN-004',
      title: 'Account Debit',
      subtitle: 'Withdrawal Request: IMPS Bank Payout',
      type: 'debit',
      amount: 500.00,
      timestamp: '2026-10-09T18:45:00Z',
      dateFormatted: '09 Oct 2026',
      timeFormatted: '06:45 PM',
      status: 'pending',
      closingBalance: 4000.00,
      category: 'Withdrawal',
      paymentMethod: 'IMPS Payout (Demo)',
      referenceCode: 'IMPS-REQ-20261009-1123',
      remarks: 'Pending verification for demo account bank payout request'
    },
    {
      id: 'DEMO-TXN-005',
      title: 'Account Credit',
      subtitle: 'Referral Bonus Reward',
      type: 'credit',
      amount: 3000.00,
      timestamp: '2026-10-08T09:10:00Z',
      dateFormatted: '08 Oct 2026',
      timeFormatted: '09:10 AM',
      status: 'completed',
      closingBalance: 4500.00,
      category: 'Bonus Reward',
      paymentMethod: 'Promotional Ledger',
      referenceCode: 'BONUS-REF-20261008',
      remarks: 'Affiliate referral bonus credit for active community user onboarding'
    },
    {
      id: 'DEMO-TXN-007',
      title: 'Account Debit',
      subtitle: 'Toss Stake: Sydney Sixers vs Scorchers',
      type: 'debit',
      amount: 3500.00,
      timestamp: '2026-10-07T14:00:00Z',
      dateFormatted: '07 Oct 2026',
      timeFormatted: '02:00 PM',
      status: 'completed',
      closingBalance: 1500.00,
      category: 'Wager Stake',
      paymentMethod: 'Wager Settlement',
      referenceCode: 'TOSS-BET-1042-STAKE',
      remarks: 'Big Bash League toss wagering stake deduction'
    },
    {
      id: 'DEMO-TXN-006',
      title: 'Account Credit',
      subtitle: 'Initial Welcome Promotional Credit',
      type: 'credit',
      amount: 5000.00,
      timestamp: '2026-10-07T11:00:00Z',
      dateFormatted: '07 Oct 2026',
      timeFormatted: '11:00 AM',
      status: 'completed',
      closingBalance: 5000.00,
      category: 'Promotional',
      paymentMethod: 'Promotional Ledger',
      referenceCode: 'PROMO-INIT-20261007',
      remarks: 'First deposit registration matching bonus incentive'
    }
  ];

  /**
   * Currency formatter helper for INR
   */
  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  function formatCurrency(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return '₹0.00';
    return currencyFormatter.format(amount);
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Calculate Ledger Totals dynamically from transaction records
   */
  function calculateLedgerSummary(transactions) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return {
        totalCredits: 0,
        totalDebits: 0,
        availableBalance: 0
      };
    }

    let totalCredits = 0;
    let totalDebits = 0;

    transactions.forEach(txn => {
      const amt = typeof txn.amount === 'number' && !isNaN(txn.amount) ? txn.amount : 0;
      if (txn.type === 'credit') {
        totalCredits += amt;
      } else if (txn.type === 'debit') {
        totalDebits += amt;
      }
    });

    const availableBalance = totalCredits - totalDebits;

    return {
      totalCredits,
      totalDebits,
      availableBalance
    };
  }

  /**
   * Render Status Badge
   */
  function renderStatusBadge(status) {
    switch (status) {
      case 'completed':
        return `<span class="txn-status-badge status-completed">Completed</span>`;
      case 'pending':
        return `<span class="txn-status-badge status-pending">Pending</span>`;
      case 'failed':
        return `<span class="txn-status-badge status-failed">Failed</span>`;
      default:
        return `<span class="txn-status-badge">${escapeHtml(status)}</span>`;
    }
  }

  /**
   * Render Single Transaction Card
   */
  function renderTxnCard(txn) {
    const isCredit = txn.type === 'credit';
    const amountSign = isCredit ? '+' : '-';
    const amountClass = isCredit ? 'credit' : 'debit';
    const iconClass = isCredit ? 'txn-icon-credit' : 'txn-icon-debit';
    const typeIcon = isCredit ? ICONS.credit : ICONS.debit;
    const typeLabel = isCredit ? 'Credit' : 'Debit';

    return `
      <article 
        class="txn-card" 
        data-txn-id="${escapeHtml(txn.id)}"
        tabindex="0"
        role="button"
        aria-label="${escapeHtml(txn.title)}, ${escapeHtml(txn.id)}, ${typeLabel} of ${formatCurrency(txn.amount)}, Status: ${escapeHtml(txn.status)}. Click for details."
      >
        <!-- Left details: Icon, Title, ID & Date -->
        <div class="txn-left">
          <div class="txn-icon-circle ${iconClass}" aria-hidden="true" title="${typeLabel}">
            ${typeIcon}
          </div>
          <div class="txn-meta-group">
            <span class="txn-title" title="${escapeHtml(txn.title)} - ${escapeHtml(txn.subtitle)}">
              ${escapeHtml(txn.title)}
            </span>
            <div class="txn-id-date">
              <span class="txn-id">${escapeHtml(txn.id)}</span>
              <span aria-hidden="true">•</span>
              <time datetime="${escapeHtml(txn.timestamp)}">${escapeHtml(txn.dateFormatted)}, ${escapeHtml(txn.timeFormatted)}</time>
            </div>
            ${renderStatusBadge(txn.status)}
          </div>
        </div>

        <!-- Right metrics: Signed Amount, Closing Balance & Details CTA -->
        <div class="txn-right">
          <span class="txn-amount ${amountClass}" aria-label="Amount: ${amountSign}${formatCurrency(txn.amount)}">
            ${amountSign}${formatCurrency(txn.amount)}
          </span>
          <span class="txn-closing-bal" title="Closing Ledger Balance">
            Bal: ${formatCurrency(txn.closingBalance)}
          </span>
          <button 
            type="button" 
            class="btn-txn-details" 
            data-txn-id="${escapeHtml(txn.id)}"
            aria-label="View details for transaction ${escapeHtml(txn.id)}"
          >
            Details ${ICONS.arrowRight}
          </button>
        </div>
      </article>
    `;
  }

  /**
   * Render Empty State
   */
  function renderEmptyState(activeFilter, searchQuery) {
    let message = 'No transactions match your current search or filter criteria.';
    if (searchQuery) {
      message = `No transactions found matching "${escapeHtml(searchQuery)}". Try another search or reset filters.`;
    } else if (activeFilter !== 'all') {
      message = `There are currently no transactions in the "${escapeHtml(activeFilter.toUpperCase())}" category.`;
    }

    return `
      <section class="passbook-empty-state empty-state" aria-live="polite">
        <div class="empty-state-icon" aria-hidden="true">
          ${ICONS.empty}
        </div>
        <h3 class="empty-state-title">No transactions found</h3>
        <p class="empty-state-desc">${message}</p>
        <button type="button" class="btn btn-outline btn-sm" id="reset-all-filters-btn">
          Reset Filters & Search
        </button>
      </section>
    `;
  }

  /**
   * Informational Placeholder Modals Handler (Deposit & Withdraw)
   */
  function setupModals() {
    const depositBtn = document.getElementById('deposit-btn');
    const withdrawBtn = document.getElementById('withdraw-btn');
    const depositModal = document.getElementById('deposit-modal');
    const withdrawModal = document.getElementById('withdraw-modal');

    let lastFocusedElement = null;

    function openModal(modal, triggerBtn) {
      if (!modal) return;
      lastFocusedElement = triggerBtn || document.activeElement;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      const closeBtn = modal.querySelector('.modal-close-btn') || modal.querySelector('.modal-footer .btn');
      if (closeBtn) closeBtn.focus();
    }

    function closeModal(modal) {
      if (!modal) return;
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    if (depositBtn && depositModal) {
      depositBtn.addEventListener('click', () => openModal(depositModal, depositBtn));
    }

    if (withdrawBtn && withdrawModal) {
      withdrawBtn.addEventListener('click', () => openModal(withdrawModal, withdrawBtn));
    }

    [depositModal, withdrawModal].forEach(modal => {
      if (!modal) return;

      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-modal-close]')) {
          closeModal(modal);
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (depositModal && depositModal.classList.contains('open')) {
          closeModal(depositModal);
        }
        if (withdrawModal && withdrawModal.classList.contains('open')) {
          closeModal(withdrawModal);
        }
      }
    });
  }

  /**
   * Main Controller Initialization
   */
  function initPassbookPage() {
    const feedContainer = document.getElementById('txn-feed-container');
    const searchInput = document.getElementById('txn-search-input');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const filterButtons = document.querySelectorAll('.txn-filter-btn');

    // Balance Elements
    const heroAvailableBalance = document.getElementById('hero-available-balance');
    const heroTotalCredits = document.getElementById('hero-total-credits');
    const heroTotalDebits = document.getElementById('hero-total-debits');

    // Transaction Details Modal Elements
    const txnDetailModal = document.getElementById('txn-detail-modal');
    const modalTxnCloseBtn = document.getElementById('modal-txn-close-btn');
    const modalTxnFooterCloseBtn = document.getElementById('modal-txn-footer-close-btn');
    const modalTxnTitle = document.getElementById('modal-txn-title');
    const modalTxnStatusBadge = document.getElementById('modal-txn-status-badge');
    const modalTxnAmount = document.getElementById('modal-txn-amount');
    const modalTxnTypeLabel = document.getElementById('modal-txn-type-label');
    const modalTxnId = document.getElementById('modal-txn-id');
    const modalTxnRefCode = document.getElementById('modal-txn-ref-code');
    const modalTxnCategory = document.getElementById('modal-txn-category');
    const modalTxnMethod = document.getElementById('modal-txn-method');
    const modalTxnDatetime = document.getElementById('modal-txn-datetime');
    const modalTxnClosing = document.getElementById('modal-txn-closing');
    const modalTxnRemarks = document.getElementById('modal-txn-remarks');

    if (!feedContainer) return;

    let currentFilter = 'all';
    let searchQuery = '';
    let lastActiveElement = null;

    // Dynamically calculate and render balance totals from transaction data
    function updateBalanceCards() {
      const summary = calculateLedgerSummary(DEMO_TRANSACTIONS);

      // Check if real authenticated user with wallet balance exists
      const authUser = window.ApiClient && typeof window.ApiClient.getUser === 'function' ? window.ApiClient.getUser() : null;
      const userBalance = authUser && authUser.wallet && (authUser.wallet.available_balance !== undefined ? authUser.wallet.available_balance : authUser.wallet.available);

      if (heroAvailableBalance) {
        heroAvailableBalance.textContent = (userBalance !== undefined && userBalance !== null)
          ? formatCurrency(userBalance)
          : formatCurrency(summary.availableBalance);
      }
      if (heroTotalCredits) {
        heroTotalCredits.textContent = `+${formatCurrency(summary.totalCredits)}`;
      }
      if (heroTotalDebits) {
        heroTotalDebits.textContent = `-${formatCurrency(summary.totalDebits)}`;
      }

      // Synchronize Top Header Balances
      if (window.SharedLayout && typeof window.SharedLayout.updateBalances === 'function') {
        const balValue = (userBalance !== undefined && userBalance !== null) ? userBalance : summary.availableBalance;
        const balFormatted = balValue.toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        const expFormatted = (authUser && authUser.wallet && authUser.wallet.exposure_balance !== undefined ? authUser.wallet.exposure_balance : 0).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
        window.SharedLayout.updateBalances(balFormatted, expFormatted);
      }
    }

    // Sort transactions chronologically (newest first)
    const sortedTransactions = [...DEMO_TRANSACTIONS].sort((a, b) => {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Update filter counts dynamically
    function updateFilterCounts() {
      const counts = {
        all: sortedTransactions.length,
        credit: sortedTransactions.filter(t => t.type === 'credit').length,
        debit: sortedTransactions.filter(t => t.type === 'debit').length,
        completed: sortedTransactions.filter(t => t.status === 'completed').length,
        pending: sortedTransactions.filter(t => t.status === 'pending').length,
        failed: sortedTransactions.filter(t => t.status === 'failed').length
      };

      filterButtons.forEach(btn => {
        const filterKey = btn.dataset.filter;
        const countSpan = btn.querySelector('.txn-filter-count');
        if (countSpan && counts[filterKey] !== undefined) {
          countSpan.textContent = counts[filterKey];
        }
      });
    }

    // Filter & search logic
    function getFilteredTransactions() {
      return sortedTransactions.filter(txn => {
        // 1. Filter match (type or status)
        let matchesFilter = true;
        if (currentFilter === 'credit' || currentFilter === 'debit') {
          matchesFilter = txn.type === currentFilter;
        } else if (currentFilter === 'completed' || currentFilter === 'pending' || currentFilter === 'failed') {
          matchesFilter = txn.status === currentFilter;
        }

        if (!matchesFilter) return false;

        // 2. Search query match
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const matchesTitle = txn.title && txn.title.toLowerCase().includes(q);
          const matchesSubtitle = txn.subtitle && txn.subtitle.toLowerCase().includes(q);
          const matchesId = txn.id && txn.id.toLowerCase().includes(q);
          const matchesType = txn.type && txn.type.toLowerCase().includes(q);
          const matchesStatus = txn.status && txn.status.toLowerCase().includes(q);
          const matchesCategory = txn.category && txn.category.toLowerCase().includes(q);
          const matchesMethod = txn.paymentMethod && txn.paymentMethod.toLowerCase().includes(q);
          const matchesRef = txn.referenceCode && txn.referenceCode.toLowerCase().includes(q);
          const matchesAmount = txn.amount && txn.amount.toString().includes(q);
          const matchesDate = txn.dateFormatted && txn.dateFormatted.toLowerCase().includes(q);

          if (!matchesTitle && !matchesSubtitle && !matchesId && !matchesType && 
              !matchesStatus && !matchesCategory && !matchesMethod && !matchesRef && 
              !matchesAmount && !matchesDate) {
            return false;
          }
        }

        return true;
      });
    }

    // Render feed
    function renderFeed() {
      const filtered = getFilteredTransactions();

      if (filtered.length === 0) {
        feedContainer.innerHTML = renderEmptyState(currentFilter, searchQuery);
        const resetBtn = document.getElementById('reset-all-filters-btn');
        if (resetBtn) {
          resetBtn.addEventListener('click', resetAll);
        }
        return;
      }

      const html = filtered.map(renderTxnCard).join('');
      feedContainer.innerHTML = html;

      // Bind Details buttons and card click triggers
      const cards = feedContainer.querySelectorAll('.txn-card');
      cards.forEach(card => {
        card.addEventListener('click', (e) => {
          const txnId = card.dataset.txnId;
          lastActiveElement = card;
          openTxnDetailsModal(txnId);
        });

        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const txnId = card.dataset.txnId;
            lastActiveElement = card;
            openTxnDetailsModal(txnId);
          }
        });
      });
    }

    /**
     * Open Transaction Details Modal
     */
    function openTxnDetailsModal(txnId) {
      const txn = DEMO_TRANSACTIONS.find(t => t.id === txnId);
      if (!txn || !txnDetailModal) return;

      const isCredit = txn.type === 'credit';
      const amountSign = isCredit ? '+' : '-';

      if (modalTxnTitle) modalTxnTitle.textContent = txn.title;
      if (modalTxnStatusBadge) modalTxnStatusBadge.innerHTML = renderStatusBadge(txn.status);
      
      if (modalTxnAmount) {
        modalTxnAmount.textContent = `${amountSign}${formatCurrency(txn.amount)}`;
        modalTxnAmount.className = `modal-highlight-amount ${txn.type}`;
      }

      if (modalTxnTypeLabel) {
        modalTxnTypeLabel.textContent = `${isCredit ? 'CREDIT' : 'DEBIT'} • ${txn.category || 'LEDGER'}`;
      }

      if (modalTxnId) modalTxnId.textContent = txn.id;
      if (modalTxnRefCode) modalTxnRefCode.textContent = txn.referenceCode || '—';
      if (modalTxnCategory) modalTxnCategory.textContent = txn.category || 'General';
      if (modalTxnMethod) modalTxnMethod.textContent = txn.paymentMethod || 'System Ledger';
      if (modalTxnDatetime) modalTxnDatetime.textContent = `${txn.dateFormatted}, ${txn.timeFormatted}`;
      if (modalTxnClosing) modalTxnClosing.textContent = formatCurrency(txn.closingBalance);
      if (modalTxnRemarks) modalTxnRemarks.textContent = txn.remarks || txn.subtitle || 'Transaction recorded in demo ledger.';

      txnDetailModal.classList.add('open');
      txnDetailModal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';

      if (modalTxnCloseBtn) {
        setTimeout(() => modalTxnCloseBtn.focus(), 50);
      }
    }

    /**
     * Close Transaction Details Modal
     */
    function closeTxnDetailsModal() {
      if (!txnDetailModal) return;
      txnDetailModal.classList.remove('open');
      txnDetailModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';

      if (lastActiveElement && typeof lastActiveElement.focus === 'function') {
        lastActiveElement.focus();
      }
    }

    // Modal close bindings
    if (modalTxnCloseBtn) {
      modalTxnCloseBtn.addEventListener('click', closeTxnDetailsModal);
    }
    if (modalTxnFooterCloseBtn) {
      modalTxnFooterCloseBtn.addEventListener('click', closeTxnDetailsModal);
    }
    if (txnDetailModal) {
      txnDetailModal.addEventListener('click', (e) => {
        if (e.target === txnDetailModal) {
          closeTxnDetailsModal();
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && txnDetailModal && txnDetailModal.classList.contains('open')) {
        closeTxnDetailsModal();
      }
    });

    // Set and apply filter
    function setFilter(filterKey) {
      currentFilter = filterKey;

      filterButtons.forEach(btn => {
        const isMatch = btn.dataset.filter === filterKey;
        btn.classList.toggle('active', isMatch);
        btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
      });

      renderFeed();
    }

    // Reset everything to default
    function resetAll() {
      searchQuery = '';
      if (searchInput) {
        searchInput.value = '';
      }
      if (searchClearBtn) {
        searchClearBtn.classList.remove('visible');
      }
      setFilter('all');
    }

    // Bind filter button clicks
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const filterKey = btn.dataset.filter;
        setFilter(filterKey);
      });
    });

    // Search input handling
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim();
        if (searchClearBtn) {
          searchClearBtn.classList.toggle('visible', searchQuery.length > 0);
        }
        renderFeed();
      });
    }

    // Clear search button
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        searchQuery = '';
        searchClearBtn.classList.remove('visible');
        renderFeed();
      });
    }

    // Setup Deposit/Withdraw Informational Modals
    setupModals();

    // Initial Dynamic Calculation & Render
    updateBalanceCards();
    updateFilterCounts();
    setFilter('all');

    // Export controller methods
    window.PassbookController = {
      init: initPassbookPage,
      getDemoTransactions: () => DEMO_TRANSACTIONS,
      calculateLedgerSummary: calculateLedgerSummary,
      getFilteredTransactions: getFilteredTransactions,
      setFilter: setFilter,
      openTxnDetailsModal: openTxnDetailsModal,
      closeTxnDetailsModal: closeTxnDetailsModal
    };
  }

  // Bind to DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPassbookPage);
  } else {
    initPassbookPage();
  }
})();

