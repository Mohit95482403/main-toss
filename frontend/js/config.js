/**
 * DADDY TOSS BOOK - Frontend Configuration
 */

const APP_CONFIG = Object.freeze({
  appName: 'DADDY TOSS BOOK',
  version: '1.0.0-day2',
  apiBaseUrl: (typeof window !== 'undefined' && window.ITB_API_URL)
    ? window.ITB_API_URL
    : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000/api'
        : '/api'),
  endpoints: {
    health: '/health',
    authRegister: '/auth/register',
    authLogin: '/auth/login',
    authMe: '/auth/me',
    authProfile: '/auth/profile',
    authChangePassword: '/auth/change-password',
    authLogout: '/auth/logout',
    walletBalance: '/wallet/balance',
    adminDashboardStats: '/admin/dashboard/stats',
    adminUsers: '/admin/users',
    adminUserCreate: '/admin/users/create',
    adminAuditLogs: '/admin/audit-logs',
    adminSystemStatus: '/admin/system/status'
  },
  defaultTheme: 'light',
  
  // Visual presentation initial balances (mock values for development preview)
  initialBalances: {
    available: '0.00',
    exposure: '0.00',
    currencySymbol: '₹'
  },

  // Centralized Announcement Ticker Messages (Supports English & Hindi)
  announcements: [
    'WELCOME TO DADDY TOSS BOOK',
    '100% SECURE & LIGHTNING FAST SETTLEMENT',
    'टॉस के बेताज बादशाह - हर मैच का लाइव टॉस उपलब्ध',
    'ALL INTERNATIONAL & T20 LEAGUE MATCHES ACTIVE',
    '24/7 DEDICATED CUSTOMER SUPPORT'
  ],

  // Brand Logo configuration
  logo: {
    src: 'assets/images/logo.png',
    alt: 'DADDY TOSS BOOK Logo'
  }
});

// Export to window namespace for vanilla script consumption
window.APP_CONFIG = APP_CONFIG;
