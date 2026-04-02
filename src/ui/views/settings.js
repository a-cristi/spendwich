import { getData, loadData, exportData, updateSettings, importBulk, updateTransaction,
         addLabel, updateLabel, deleteLabel,
         addCategory, updateCategory, deleteCategory, reassignCategory } from '../../store.js';
import { fetchRate, convertAmount } from '../../currency.js';
import { importTransactions } from '../csv.js';
import { openModal } from '../modal.js';
import { toast } from '../toast.js';
import { escHtml } from '../utils.js';
import { attachWidget, confirmLoadIfConnected, pauseAutosave, resumeAutosave } from '../remotestorage.js';
import { getThemePref, setTheme } from '../theme.js';

const EMOJI_SET = [
  '🏷️','🍔','🍕','🍜','🍣','🥗','☕','🍺','🥂',
  '🚗','🚌','✈️','🚂','🚲','⛽',
  '🏠','🏡','🔑','🛁','🔨','💡','🛒','💧','🔌','🔥',
  '🛍️','👕','👟','💄','💎',
  '🎬','🍿','🎮','🎵','🎨','📚','🎭','📺','🏖️',
  '💊','🏥','💪','🧘',
  '💰','💳','📈','🏦','💵','🧾','🏛️','🎁',
  '🧳','🌴','🎉','🍸','💃',
  '❤️','🌹','👨‍👩‍👧‍👦',
  '👶','🐶','🐱','🌿','⚽','💼','💻','📱','🎓',
];

let _container = null;

export function render(container) {
  _container = container;
  const overflowMenu = document.querySelector('.nav-overflow-menu');
  if (overflowMenu) { overflowMenu.innerHTML = ''; overflowMenu.classList.remove('active'); }
  const overflowTrigger = document.querySelector('.nav-overflow-trigger');
  if (overflowTrigger) overflowTrigger.style.display = 'none';
  refresh();
}

function refresh() {
  const data = getData();
  const { defaultCurrency } = data.settings;

  _container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  header.innerHTML = '<div class="page-title-block"><h1>Settings</h1><p class="page-subtitle">Manage categories, labels, and preferences</p></div>';
  _container.appendChild(header);

  const layout = document.createElement('div');
  layout.className = 'manage-layout';
  _container.appendChild(layout);

  const main = document.createElement('div');
  main.className = 'manage-main';
  layout.appendChild(main);

  const aside = document.createElement('div');
  aside.className = 'manage-aside';
  layout.appendChild(aside);

  // ── Left column ─────────────────────────────────────────────────────────
  renderCategoriesSection(main, data.categories);
  renderLabelsSection(main, data.labels);

  // ── Right column ─────────────────────────────────────────────────────────
  function makeSection(title) {
    const sec = document.createElement('div');
    sec.className = 'settings-section';
    const t = document.createElement('div');
    t.className = 'settings-section-title';
    t.textContent = title;
    sec.appendChild(t);
    aside.appendChild(sec);
    return sec;
  }

  // Preferences: theme + currency
  const prefSection = makeSection('Preferences');

  const themeGroup = document.createElement('div');
  themeGroup.className = 'seg-group';
  themeGroup.style.cssText = 'max-width:216px;margin-bottom:0.75rem';
  const currentPref = getThemePref();
  for (const [pref, label] of [['light', 'Light'], ['auto', 'Auto'], ['dark', 'Dark']]) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm ' + (currentPref === pref ? 'btn-primary' : 'btn-secondary');
    btn.textContent = label;
    btn.addEventListener('click', () => { setTheme(pref); refresh(); });
    themeGroup.appendChild(btn);
  }
  prefSection.appendChild(themeGroup);

  const currGroup = document.createElement('div');
  currGroup.className = 'form-group';
  currGroup.style.marginBottom = '0';
  currGroup.innerHTML = `
    <label for="default-currency">Default currency (ISO 4217, e.g. USD, EUR)</label>
    <div style="display:flex;gap:0.5rem;max-width:260px">
      <input type="text" id="default-currency" value="${escHtml(defaultCurrency)}" maxlength="10">
      <button class="btn btn-primary" id="save-currency">Save</button>
    </div>
  `;
  prefSection.appendChild(currGroup);

  prefSection.querySelector('#save-currency').addEventListener('click', async () => {
    const val = prefSection.querySelector('#default-currency').value.trim().toUpperCase();
    if (!val) return;

    const oldDefault = getData().settings.defaultCurrency;
    if (val === oldDefault) { toast('Default currency updated', 'success'); return; }

    const btn = prefSection.querySelector('#save-currency');
    btn.disabled = true;
    let paused = false;
    try {
      const txs = getData().transactions;
      const succeeded = [];
      const failed = [];
      const failedPairs = new Set();
      btn.textContent = txs.length ? `Fetching rates… 0/${txs.length}` : 'Saving…';
      for (const tx of txs) {
        if (tx.currency === val) {
          succeeded.push({ id: tx.id, exchangeRate: 1, amountInDefault: tx.amount });
        } else {
          const rate = await fetchRate(tx.currency, val, tx.date);
          if (rate === null || rate === undefined) {
            failed.push({ id: tx.id });
            failedPairs.add(tx.currency);
          } else {
            succeeded.push({ id: tx.id, exchangeRate: rate, amountInDefault: convertAmount(tx.amount, rate) });
          }
        }
        btn.textContent = `Fetching rates… ${succeeded.length + failed.length}/${txs.length}`;
      }

      if (failed.length > 0) {
        const proceed = await confirmPartialMigration(val, [...failedPairs]);
        if (!proceed) return;
      }

      paused = true;
      pauseAutosave();
      updateSettings({ defaultCurrency: val });
      for (const { id, exchangeRate, amountInDefault } of succeeded) {
        updateTransaction(id, { exchangeRate, amountInDefault });
      }

      if (failed.length > 0) {
        const errorLabel = getData().labels.find(l => l.name === 'exchange-rate-error') ?? addLabel('exchange-rate-error');
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

  // Sync
  const syncSection = makeSection('Sync');
  const widgetContainer = document.createElement('div');
  syncSection.appendChild(widgetContainer);
  attachWidget(widgetContainer);

  // Data
  const ioSection = makeSection('Data');
  ioSection.insertAdjacentHTML('beforeend', `
    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center">
      <button class="btn btn-sm btn-secondary" id="export-btn">Export JSON</button>
      <label class="btn btn-sm btn-secondary" style="cursor:pointer">
        Import JSON
        <input type="file" id="import-json-input" accept=".json" style="display:none">
      </label>
      <label class="btn btn-sm btn-secondary" style="cursor:pointer">
        Import CSV
        <input type="file" id="import-csv-input" accept=".csv,text/csv" style="display:none">
      </label>
    </div>
    <div id="csv-status" style="margin-top:0.5rem;font-size:0.8rem"></div>
    <p style="margin-top:0.5rem;font-size:0.8rem;color:var(--text-muted)">JSON backup/restore · CSV import appends transactions (columns: date, amount, currency, category, description, labels)</p>
  `);

  ioSection.querySelector('#export-btn').addEventListener('click', () => {
    const json = exportData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spendwich-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  ioSection.querySelector('#import-json-input').addEventListener('change', e => {
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

  ioSection.querySelector('#import-csv-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const statusEl = ioSection.querySelector('#csv-status');
    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const { categories, labels, transactions } = await importTransactions(evt.target.result, getData());
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

// ── Category section ──────────────────────────────────────────────────────

function renderCategoriesSection(parent, categories) {
  const section = document.createElement('div');
  section.className = 'settings-section';

  const header = document.createElement('div');
  header.className = 'settings-section-header';
  header.innerHTML = `
    <div class="settings-section-title">Categories</div>
    <button class="btn btn-sm btn-primary" id="add-cat-btn">+ Add</button>
  `;
  section.appendChild(header);

  if (categories.length === 0) {
    section.insertAdjacentHTML('beforeend', '<div class="list-empty">No categories yet. Add one to get started.</div>');
  } else {
    const list = document.createElement('div');
    list.className = 'list';
    for (const cat of categories) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <span style="font-size:1.1rem;width:2rem;text-align:center;flex-shrink:0">${cat.icon ?? '🏷️'}</span>
        <span style="flex:1;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(cat.name)}</span>
        <button class="btn btn-sm btn-secondary edit-btn">Edit</button>
        <button class="btn btn-sm btn-danger del-btn">Delete</button>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openCategoryModal(cat));
      row.querySelector('.del-btn').addEventListener('click', () => confirmDeleteCategory(cat));
      list.appendChild(row);
    }
    section.appendChild(list);
  }

  parent.appendChild(section);
  section.querySelector('#add-cat-btn').addEventListener('click', () => openCategoryModal(null));
}

function openCategoryModal(cat) {
  const isEdit = cat !== null;
  let selectedIcon = cat?.icon ?? '🏷️';

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label for="cat-name" class="tx-field-label">Name</label>
      <input type="text" id="cat-name" value="${escHtml(cat?.name ?? '')}" placeholder="e.g. Groceries" autocomplete="off">
      <div class="field-error" id="cat-name-error"></div>
    </div>
    <div class="form-group">
      <span class="tx-field-label">Icon</span>
      <div id="icon-picker" class="icon-picker-grid">
        ${EMOJI_SET.map(e => `
          <button type="button" class="icon-btn${e === selectedIcon ? ' selected' : ''}" data-icon="${e}">${e}</button>
        `).join('')}
      </div>
    </div>
  `;

  body.querySelector('#icon-picker').addEventListener('click', e => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    selectedIcon = btn.dataset.icon;
    body.querySelectorAll('.icon-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.icon === selectedIcon);
    });
  });

  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-primary save-btn">${isEdit ? 'Save' : 'Add'}</button>
  `;

  const { close } = openModal({ title: isEdit ? 'Edit category' : 'New category', subtitle: 'Category', deco: 'CATEGORY', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.save-btn').addEventListener('click', () => {
    const name = body.querySelector('#cat-name').value.trim();
    const errEl = body.querySelector('#cat-name-error');
    errEl.textContent = '';
    if (!name) { body.querySelector('#cat-name').focus(); return; }
    try {
      if (isEdit) {
        updateCategory(cat.id, { name, icon: selectedIcon });
        toast('Category updated', 'success');
      } else {
        addCategory(name, selectedIcon);
        toast('Category added', 'success');
      }
      close();
      refresh();
    } catch (e) {
      errEl.textContent = e.message;
      body.querySelector('#cat-name').focus();
    }
  });

  setTimeout(() => body.querySelector('#cat-name').focus(), 50);
}

function confirmDeleteCategory(cat) {
  const data = getData();
  const affected = data.transactions.filter(t => t.categoryId === cat.id).length;
  const otherCats = data.categories.filter(c => c.id !== cat.id);

  const body = document.createElement('div');

  if (affected === 0) {
    body.innerHTML = `<p>Delete "${escHtml(cat.name)}"? No transactions use this category.</p>`;
  } else {
    let selectedCatId = null;
    const catCards = otherCats.map(c =>
      `<div class="cat-card" data-cat-id="${escHtml(c.id)}"><span class="cat-card-emoji">${c.icon ?? '🏷️'}</span><span class="cat-card-name">${escHtml(c.name)}</span></div>`
    ).join('');

    const labelChips = data.labels.map(l =>
      `<label class="tx-label-chip"><input type="checkbox" value="${escHtml(l.id)}" style="display:none">${escHtml(l.name)}</label>`
    ).join('');

    body.innerHTML = `
      <p style="margin-top:0"><strong>${affected}</strong> transaction${affected === 1 ? '' : 's'} use${affected === 1 ? 's' : ''} this category.</p>
      ${otherCats.length > 0 ? `
      <div class="form-group">
        <span class="tx-field-label">Reassign to</span>
        <div class="tx-cat-picker" id="reassign-cat">
          <div class="cat-search-wrap">
            <svg class="cat-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input class="cat-search" type="text" placeholder="Search categories…">
          </div>
          <div class="cat-grid">${catCards}</div>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Optional — skip to leave as "(deleted)"</div>
      </div>` : ''}
      ${data.labels.length > 0 ? `
      <div class="form-group">
        <span class="tx-field-label">Add label</span>
        <div class="tx-labels-wrap" id="reassign-labels">${labelChips}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Optional — tag affected transactions for easy filtering</div>
      </div>` : ''}
    `;

    // Category card selection
    const catPicker = body.querySelector('#reassign-cat');
    if (catPicker) {
      catPicker.addEventListener('click', e => {
        const card = e.target.closest('.cat-card');
        if (!card) return;
        const id = card.dataset.catId;
        if (selectedCatId === id) {
          selectedCatId = null;
          card.classList.remove('selected');
        } else {
          catPicker.querySelectorAll('.cat-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          selectedCatId = id;
        }
      });

      const searchInput = catPicker.querySelector('.cat-search');
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        catPicker.querySelectorAll('.cat-card').forEach(card => {
          const name = card.querySelector('.cat-card-name').textContent.toLowerCase();
          card.style.display = name.includes(q) ? '' : 'none';
        });
      });
    }

    // Label chip toggle
    const labelsWrap = body.querySelector('#reassign-labels');
    if (labelsWrap) {
      labelsWrap.addEventListener('change', e => {
        const chip = e.target.closest('.tx-label-chip');
        if (chip) chip.classList.toggle('selected', e.target.checked);
      });
    }

    // Store selection getter for the confirm handler
    body._getSelection = () => {
      const labelIds = [];
      if (labelsWrap) {
        labelsWrap.querySelectorAll('input:checked').forEach(cb => labelIds.push(cb.value));
      }
      return { catId: selectedCatId, labelIds };
    };
  }

  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-danger confirm-btn">Delete</button>
  `;

  const { close } = openModal({ title: 'Delete category', subtitle: 'Category', deco: 'CATEGORY', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    let reassigned = false;
    if (affected > 0 && body._getSelection) {
      const { catId, labelIds } = body._getSelection();
      if (catId || labelIds.length > 0) {
        reassignCategory(cat.id, catId, labelIds);
        reassigned = !!catId;
      }
    }
    deleteCategory(cat.id);
    const msg = reassigned
      ? `Category deleted, ${affected} transaction${affected === 1 ? '' : 's'} reassigned`
      : 'Category deleted';
    toast(msg, 'success');
    close();
    refresh();
  });
}

// ── Label section ─────────────────────────────────────────────────────────

function renderLabelsSection(parent, labels) {
  const section = document.createElement('div');
  section.className = 'settings-section';

  const header = document.createElement('div');
  header.className = 'settings-section-header';
  header.innerHTML = `
    <div class="settings-section-title">Labels</div>
    <button class="btn btn-sm btn-primary" id="add-lbl-btn">+ Add</button>
  `;
  section.appendChild(header);

  if (labels.length === 0) {
    section.insertAdjacentHTML('beforeend', '<div class="list-empty">No labels yet. Add one to get started.</div>');
  } else {
    const list = document.createElement('div');
    list.className = 'list';
    for (const lbl of labels) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <span style="flex:1;font-weight:500">${escHtml(lbl.name)}</span>
        <button class="btn btn-sm btn-secondary edit-btn">Edit</button>
        <button class="btn btn-sm btn-danger del-btn">Delete</button>
      `;
      row.querySelector('.edit-btn').addEventListener('click', () => openLabelModal(lbl));
      row.querySelector('.del-btn').addEventListener('click', () => confirmDeleteLabel(lbl));
      list.appendChild(row);
    }
    section.appendChild(list);
  }

  parent.appendChild(section);
  section.querySelector('#add-lbl-btn').addEventListener('click', () => openLabelModal(null));
}

function openLabelModal(lbl) {
  const isEdit = lbl !== null;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="form-group">
      <label for="lbl-name" class="tx-field-label">Name</label>
      <input type="text" id="lbl-name" value="${escHtml(lbl?.name ?? '')}" placeholder="e.g. work-trip" autocomplete="off">
      <div class="field-error" id="lbl-name-error"></div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-primary save-btn">${isEdit ? 'Save' : 'Add'}</button>
  `;

  const { close } = openModal({ title: isEdit ? 'Edit label' : 'New label', subtitle: 'Label', deco: 'LABEL', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.save-btn').addEventListener('click', () => {
    const name = body.querySelector('#lbl-name').value.trim();
    const errEl = body.querySelector('#lbl-name-error');
    errEl.textContent = '';
    if (!name) { body.querySelector('#lbl-name').focus(); return; }
    try {
      if (isEdit) {
        updateLabel(lbl.id, { name });
        toast('Label updated', 'success');
      } else {
        addLabel(name);
        toast('Label added', 'success');
      }
      close();
      refresh();
    } catch (e) {
      errEl.textContent = e.message;
      body.querySelector('#lbl-name').focus();
    }
  });

  setTimeout(() => body.querySelector('#lbl-name').focus(), 50);
}

function confirmDeleteLabel(lbl) {
  const body = document.createElement('p');
  body.textContent = `Delete "${lbl.name}"? Existing transactions will keep a reference to it (shown as deleted).`;

  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary cancel-btn">Cancel</button>
    <button class="btn btn-danger confirm-btn">Delete</button>
  `;

  const { close } = openModal({ title: 'Delete label', subtitle: 'Label', deco: 'LABEL', body, footer });
  footer.querySelector('.cancel-btn').addEventListener('click', close);
  footer.querySelector('.confirm-btn').addEventListener('click', () => {
    deleteLabel(lbl.id);
    toast('Label deleted', 'success');
    close();
    refresh();
  });
}

// ── Currency migration helper ─────────────────────────────────────────────

function confirmPartialMigration(newCurrency, failedCurrencies) {
  return new Promise(resolve => {
    const body = document.createElement('p');
    body.innerHTML = `Exchange rates could not be fetched for: <strong>${escHtml(failedCurrencies.join(', '))}</strong>.
      <br><br>You can still switch to ${escHtml(newCurrency)} — affected transactions will be
      tagged with an <strong>exchange-rate-error</strong> label so you can find and correct them.`;

    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn btn-secondary cancel-btn">Cancel</button>
      <button class="btn btn-primary proceed-btn">Change anyway</button>
    `;

    const { close } = openModal({ title: 'Some rates unavailable', body, footer });
    footer.querySelector('.cancel-btn').addEventListener('click',  () => { close(); resolve(false); });
    footer.querySelector('.proceed-btn').addEventListener('click', () => { close(); resolve(true);  });
  });
}
