// ============================================================================
// PRODUCTION BACKEND URL CONFIGURATION
// If deploying frontend (Vercel) and backend (Render) separately,
// paste your deployed Render backend URL here: (e.g. 'https://my-backend.onrender.com')
// When set, all frontend API calls will route to this base URL + '/api'.
// If left empty (''), it automatically uses the same-origin '/api' in production
// or 'http://localhost:5000/api' when running locally.
// ============================================================================
const PRODUCTION_BACKEND_URL = 'https://daddy-toss-book-backend.onrender.com';

function resolveApiBaseUrl() {
  // 1. Explicit window override (e.g. injected script or environment snippet)
  if (typeof window !== 'undefined' && (window.DTB_API_URL || window.ITB_API_URL)) {
    const custom = (window.DTB_API_URL || window.ITB_API_URL).trim().replace(/\/+$/, '');
    return custom.endsWith('/api') ? custom : `${custom}/api`;
  }

  // 2. Explicit production constant configured above
  if (PRODUCTION_BACKEND_URL && PRODUCTION_BACKEND_URL.trim() !== '') {
    const trimmed = PRODUCTION_BACKEND_URL.trim().replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }

  // 3. Localhost development environments (Live Server, Vite dev, port 3000/5500/5173)
  if (typeof window !== 'undefined' && window.location) {
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocal) {
      if (window.location.port === '5000') return '/api';
      return `${window.location.protocol}//${window.location.hostname}:5000/api`;
    }
  }

  // 4. Default same-origin production fallback (/api)
  return '/api';
}

const APP_CONFIG = Object.freeze({
  appName: 'DADDY TOSS BOOK',
  version: '1.0.0-day2',
  apiBaseUrl: resolveApiBaseUrl(),
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
