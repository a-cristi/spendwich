import { getData, loadData, exportData, updateSettings, importBulk, updateTransaction, addLabel } from '../../store.js';
import { fetchRate, convertAmount } from '../../currency.js';
import { importTransactions } from '../../csv.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { escHtml } from '../utils.js';
import { attachWidget, confirmLoadIfConnected, pauseAutosave, resumeAutosave } from '../remotestorage.js';
import { getThemePref, setTheme } from '../theme.js';

let _container = null;

export function render(container) {
  _container = container;
  refresh();
}

function refresh() {
  const data = getData();
  const { defaultCurrency } = data.settings;

  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = '<h1>Settings</h1>';
  _container.appendChild(header);

  const card = document.createElement('div');
  card.className = 'card';
  card.style.padding = '1.5rem';
  _container.appendChild(card);

  // Appearance
  const appearanceSection = document.createElement('div');
  appearanceSection.style.marginBottom = '1.5rem';
  const appearanceTitle = document.createElement('p');
  appearanceTitle.style.cssText = 'font-weight:600;margin-bottom:0.5rem';
  appearanceTitle.textContent = 'Appearance';
  const themeGroup = document.createElement('div');
  themeGroup.className = 'seg-group';
  const currentPref = getThemePref();
  for (const [pref, label] of [['light', 'Light'], ['auto', 'Auto'], ['dark', 'Dark']]) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm ' + (currentPref === pref ? 'btn-primary' : 'btn-secondary');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      setTheme(pref);
      refresh();
    });
    themeGroup.appendChild(btn);
  }
  appearanceSection.appendChild(appearanceTitle);
  appearanceSection.appendChild(themeGroup);
  card.appendChild(appearanceSection);

  card.appendChild(document.createElement('hr'));
  card.lastChild.style.cssText = 'margin:1.5rem 0;border:none;border-top:1px solid var(--border)';

  // Currency setting
  const currGroup = document.createElement('div');
  currGroup.className = 'form-group';
  currGroup.innerHTML = `
    <label for="default-currency">Default currency (ISO 4217, e.g. USD, EUR)</label>
    <div style="display:flex;gap:0.5rem;max-width:300px">
      <input type="text" id="default-currency" value="${escHtml(defaultCurrency)}" maxlength="10">
      <button class="btn btn-primary" id="save-currency">Save</button>
    </div>
  `;
  card.appendChild(currGroup);

  card.querySelector('#save-currency').addEventListener('click', async () => {
    const val = card.querySelector('#default-currency').value.trim().toUpperCase();
    if (!val) return;

    const oldDefault = getData().settings.defaultCurrency;
    if (val === oldDefault) {
      toast('Default currency updated', 'success');
      return;
    }

    const btn = card.querySelector('#save-currency');
    btn.disabled = true;
    let paused = false;
    try {
      const txs = getData().transactions;

      // Phase 1: pre-fetch all rates
      const succeeded = [];
      const failed = [];
      const failedPairs = new Set();
      btn.textContent = txs.length ? `Fetching rates… 0/${txs.length}` : 'Saving…';
      for (const tx of txs) {
        if (tx.currency === val) {
          succeeded.push({ id: tx.id, exchangeRate: 1, amountInDefault: tx.amount });
        } else {
          const rate = await fetchRate(tx.currency, val, tx.date);
          if (rate == null) {
            failed.push({ id: tx.id });
            failedPairs.add(tx.currency);
          } else {
            succeeded.push({ id: tx.id, exchangeRate: rate, amountInDefault: convertAmount(tx.amount, rate) });
          }
        }
        btn.textContent = `Fetching rates… ${succeeded.length + failed.length}/${txs.length}`;
      }

      // Phase 2: if any failures, ask the user whether to proceed
      if (failed.length > 0) {
        const proceed = await confirmPartialMigration(val, [...failedPairs]);
        if (!proceed) return;
      }

      // Phase 3: commit currency change + successful recalculations
      // Pause remote autosave for the batch — resume once when all done
      paused = true;
      pauseAutosave();
      updateSettings({ defaultCurrency: val });
      for (const { id, exchangeRate, amountInDefault } of succeeded) {
        updateTransaction(id, { exchangeRate, amountInDefault });
      }

      // Phase 4: tag failed transactions with an 'error' label so user can find them
      if (failed.length > 0) {
        let errorLabel = getData().labels.find(l => l.name === 'exchange-rate-error') ?? addLabel('exchange-rate-error');
        for (const { id } of failed) {
          const tx = getData().transactions.find(t => t.id === id);
          if (tx && !tx.labelIds.includes(errorLabel.id)) {
            updateTransaction(id, { labelIds: [...tx.labelIds, errorLabel.id] });
          }
        }
      }

      toast('Default currency updated', 'success');
      refresh();
    } finally {
      if (paused) resumeAutosave();
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });

  card.appendChild(document.createElement('hr'));
  card.lastChild.style.cssText = 'margin:1.5rem 0;border:none;border-top:1px solid var(--border)';

  // Sync
  const syncSection = document.createElement('div');
  syncSection.style.marginBottom = '1.5rem';
  const syncTitle = document.createElement('p');
  syncTitle.style.cssText = 'font-weight:600;margin-bottom:0.5rem';
  syncTitle.textContent = 'Sync';
  const syncDesc = document.createElement('p');
  syncDesc.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:0.75rem';
  syncDesc.textContent = 'Connect a remoteStorage account (5apps, self-hosted) to sync your data across devices.';
  const widgetContainer = document.createElement('div');
  syncSection.appendChild(syncTitle);
  syncSection.appendChild(syncDesc);
  syncSection.appendChild(widgetContainer);
  card.appendChild(syncSection);
  attachWidget(widgetContainer);

  card.appendChild(document.createElement('hr'));
  card.lastChild.style.cssText = 'margin:1.5rem 0;border:none;border-top:1px solid var(--border)';

  // Import/Export
  const ioSection = document.createElement('div');
  ioSection.innerHTML = `
    <p style="font-weight:600;margin-bottom:1rem">Data</p>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center">
      <button class="btn btn-secondary" id="export-btn">Export JSON</button>
      <label class="btn btn-secondary" style="cursor:pointer">
        Import JSON
        <input type="file" id="import-json-input" accept=".json" style="display:none">
      </label>
      <label class="btn btn-secondary" style="cursor:pointer">
        Import CSV
        <input type="file" id="import-csv-input" accept=".csv,text/csv" style="display:none">
      </label>
    </div>
    <div id="csv-status" style="margin-top:0.5rem;font-size:0.8rem"></div>
    <p style="margin-top:0.75rem;font-size:0.8rem;color:var(--text-muted)">
      JSON export/import saves or restores all data. CSV import appends transactions.<br>
      CSV columns: <code>date</code>, <code>amount</code>, <code>currency</code>, <code>category</code>, <code>description</code>, <code>labels</code> (optional, semicolon-separated).
    </p>
  `;
  card.appendChild(ioSection);

  card.querySelector('#export-btn').addEventListener('click', () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendwich-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  card.querySelector('#import-json-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const raw = evt.target.result;
      confirmLoadIfConnected(raw, () => {
        try {
          loadData(raw);
          toast('Data imported successfully', 'success');
          refresh();
        } catch (err) {
          toast(`Import failed: ${err.message}`, 'error');
        }
      });
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  card.querySelector('#import-csv-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = card.querySelector('#csv-status');
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const { categories, labels, transactions } = importTransactions(evt.target.result, getData());
        importBulk(categories, labels, transactions);
        statusEl.innerHTML = '';
        toast(`Imported ${transactions.length} transaction(s)`, 'success');
      } catch (err) {
        statusEl.innerHTML = `<span style="color:var(--expense)">${escHtml(err.message)}</span>`;
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function confirmPartialMigration(newCurrency, failedCurrencies) {
  return new Promise(resolve => {
    const body = document.createElement('p');
    body.style.fontSize = '0.9rem';
    body.innerHTML = `Exchange rates could not be fetched for: <strong>${escHtml(failedCurrencies.join(', '))}</strong>.
      <br><br>You can still switch to ${escHtml(newCurrency)} — affected transactions will be
      tagged with an <strong>exchange-rate-error</strong> label so you can find and correct them.`;

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end';
    footer.innerHTML = `
      <button class="btn btn-secondary cancel-btn">Cancel</button>
      <button class="btn btn-primary proceed-btn">Change anyway</button>
    `;

    const { close } = openModal({ title: 'Some rates unavailable', body, footer });
    footer.querySelector('.cancel-btn').addEventListener('click',  () => { close(); resolve(false); });
    footer.querySelector('.proceed-btn').addEventListener('click', () => { close(); resolve(true);  });
  });
}

