import { render as renderTransactions } from './views/transactions.js';
import { render as renderReports } from './views/reports.js';
import { render as renderSettings } from './views/settings.js';
import { initRemoteStorage } from './remotestorage.js';
import { initTheme } from './theme.js';

const ROUTES = {
  '#transactions': renderTransactions,
  '#reports': renderReports,
  '#settings': renderSettings,
};

const DEFAULT_ROUTE = '#transactions';

export function init(container) {
  function navigate() {
    let hash = location.hash || DEFAULT_ROUTE;
    // Redirect old routes into settings
    if (hash === '#categories' || hash === '#labels') hash = '#settings';
    const render = ROUTES[hash] ?? ROUTES[DEFAULT_ROUTE];
    container.innerHTML = '';

    document.querySelectorAll('nav a:not(.brand)').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === hash);
    });

    render(container);
  }

  initTheme();
  initRemoteStorage(navigate);
  window.addEventListener('hashchange', navigate);
  navigate();
}
