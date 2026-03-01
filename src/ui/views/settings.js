import { getData, loadData, exportData, updateSettings } from '../../store.js';
import { toast } from '../toast.js';

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

  card.querySelector('#save-currency').addEventListener('click', () => {
    const val = card.querySelector('#default-currency').value.trim().toUpperCase();
    if (!val) return;
    updateSettings({ defaultCurrency: val });
    toast('Default currency updated', 'success');
  });

  card.appendChild(document.createElement('hr'));
  card.lastChild.style.cssText = 'margin:1.5rem 0;border:none;border-top:1px solid var(--border)';

  // Import/Export
  const ioSection = document.createElement('div');
  ioSection.innerHTML = `
    <p style="font-weight:600;margin-bottom:1rem">Data</p>
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
      <button class="btn btn-secondary" id="export-btn">Export JSON</button>
      <label class="btn btn-secondary" style="cursor:pointer">
        Import JSON
        <input type="file" id="import-input" accept=".json" style="display:none">
      </label>
    </div>
    <p style="margin-top:0.75rem;font-size:0.8rem;color:var(--text-muted)">
      Exporting saves your data as a JSON file. Importing replaces all current data.
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

  card.querySelector('#import-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        loadData(evt.target.result);
        toast('Data imported successfully', 'success');
        refresh();
      } catch (err) {
        toast(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
