/**
 * IRONMAN TOSS BOOK - Frontend Configuration
 */

const APP_CONFIG = Object.freeze({
  appName: 'IRONMAN TOSS BOOK',
  version: '1.0.0-day1',
  apiBaseUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : '/api',
  endpoints: {
    health: '/health'
  },
  defaultTheme: 'light'
});

// Export to window namespace for vanilla script consumption
window.APP_CONFIG = APP_CONFIG;
