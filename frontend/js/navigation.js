/**
 * DADDY TOSS BOOK - Navigation Controller (Day 2)
 * Manages active navigation states, accessibility, keyboard focus, and link routing.
 */

(function () {
  'use strict';

  function initNavigation() {
    const bottomNav = document.querySelector('.bottom-nav');
    if (!bottomNav) return;

    // Determine active page identifier
    const currentPage = (document.body && document.body.dataset.page) || 'home';

    // Highlight active link and set aria-current
    const navItems = bottomNav.querySelectorAll('.bottom-nav-item');
    navItems.forEach(item => {
      const pageId = item.dataset.nav;
      if (pageId === currentPage) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'page');
      } else {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
      }

      // Avoid redundant page reloads if clicking the already active tab
      item.addEventListener('click', (e) => {
        if (item.classList.contains('active')) {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }

  // Bind on DOMContentLoaded or immediate execution
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
  } else {
    initNavigation();
  }

  window.NavigationController = {
    init: initNavigation
  };
})();
