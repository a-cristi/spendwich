import { render as renderTransactions } from './views/transactions.js';
import { render as renderCategories } from './views/categories.js';
import { render as renderLabels } from './views/labels.js';
import { render as renderReports } from './views/reports.js';
import { render as renderSettings } from './views/settings.js';
import { initRemoteStorage } from './remotestorage.js';
import { initTheme } from './theme.js';

const ROUTES = {
  '#transactions': renderTransactions,
  '#categories': renderCategories,
  '#labels': renderLabels,
  '#reports': renderReports,
  '#settings': renderSettings,
};

const DEFAULT_ROUTE = '#transactions';

export function init(container) {
  function navigate() {
    const hash = location.hash || DEFAULT_ROUTE;
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
