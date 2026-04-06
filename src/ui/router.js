import { render as renderTransactions } from './views/transactions.js';
import { render as renderReports } from './views/reports.js';
import { render as renderSettings } from './views/settings.js';
import { initRemoteStorage, confirmLoadIfConnected } from './remotestorage.js';
import { initTheme } from './theme.js';
import { getData, onDataChange, loadData } from '../store.js';
import { emptyData } from '../schema.js';

function updateSampleBanner() {
  const banner = document.querySelector('#sample-banner');
  if (!banner) return;
  banner.style.display = getData().settings?.sampleData ? 'flex' : 'none';
}

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
    updateSampleBanner();
  }

  initTheme();
  initRemoteStorage(navigate);
  onDataChange(updateSampleBanner);
  document.querySelector('#clear-sample-btn')?.addEventListener('click', () => {
    confirmLoadIfConnected(null, () => {
      loadData(JSON.stringify(emptyData()));
      navigate();
    }, 'Starting fresh will clear your local data and overwrite the copy in remote storage too. Continue?');
  });
  window.addEventListener('hashchange', navigate);
  navigate();
}
