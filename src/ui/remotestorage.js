import { loadData, exportData, onDataChange } from '../store.js';
import { isSameData } from '../sync.js';
import { toast } from './toast.js';
import { openModal } from './modal.js';

const _LS_KEY = 'spendwich-data';

let _rs = null;
let _client = null;
let _refreshFn = null;
let _syncing = false;        // guard: prevents loadData → _notifyChange → saveToRemote loop
let _paused = false;         // paused during currency migration batch
let _pendingRefresh = false; // refresh deferred to next sync-done to avoid mid-sync widget recreate
let _widgetContainer = null; // tracked so onSyncDone can recreate the widget in-place
let _reconciling = false;    // prevents concurrent reconciliation on rapid-fire connect events

export function initRemoteStorage(refreshFn) {
  _refreshFn = refreshFn;

  // Restore from localStorage on every load — works on file://, enables offline mode.
  const saved = localStorage.getItem(_LS_KEY);
  if (saved) { try { loadData(saved); } catch { /* invalid, ignore */ } }

  // Mirror every store mutation to localStorage (not gated on _syncing — we always
  // want localStorage in sync, including when loading remote data into the store).
  onDataChange(_saveToLocalStorage);

  if (location.protocol === 'file:') return;

  _rs = new RemoteStorage({ logging: false });
  _rs.access.claim('spendwich', 'rw');
  _client = _rs.scope('/spendwich/');
  _rs.caching.enable('/spendwich/');

  _rs.on('ready', onReady);
  _rs.on('connected', onConnected);
  _rs.on('disconnected', onDisconnected);
  _rs.on('sync-done', onSyncDone);
  _client.on('change', onRemoteChange);

  onDataChange(scheduleAutosave);
}

function _saveToLocalStorage() {
  localStorage.setItem(_LS_KEY, exportData());
}

function _rawHasData(raw) {
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    return d.transactions?.length > 0 || d.categories?.length > 0 || d.labels?.length > 0;
  } catch { return false; }
}

// Runs on every successful connection (initial, reconnect, redirect OAuth).
// Fetches remote, compares with local, and takes the appropriate action.
// _reconciling prevents double-running when onReady and onConnected both fire.
async function _reconcile() {
  if (_reconciling) return;
  _reconciling = true;
  try {
    const raw = await fetchRemote();
    const localRaw = localStorage.getItem(_LS_KEY);
    const localHasData = _rawHasData(localRaw);
    if (raw && localHasData && !isSameData(localRaw, raw)) {
      _showFirstConnectConflict(localRaw, raw);
    } else if (raw && !isSameData(localRaw, raw)) {
      _syncing = true;
      try { loadData(raw); } catch { /* invalid remote data — leave local as-is */ }
      _syncing = false;
      _refreshFn();
    } else if (!raw && localHasData) {
      await saveToRemote();
    }
    // raw && isSameData: already in sync; onSyncDone handles widget refresh
  } finally {
    _reconciling = false;
  }
}

async function onReady() {
  if (!_rs.remote.connected) return;
  await _reconcile();
}

async function onConnected() {
  toast('Storage connected', 'success');
  await _reconcile();
}

function onDisconnected() {
  toast('Storage disconnected', 'info');
}

async function onRemoteChange(event) {
  if (event.relativePath !== 'data.json' || event.origin !== 'remote') return;
  const raw = await fetchRemote();
  if (!raw) return;
  _syncing = true;
  try { loadData(raw); } catch { /* ignore */ }
  _syncing = false;
  if (!document.querySelector('dialog[open]')) _pendingRefresh = true;
}

function onSyncDone() {
  if (_pendingRefresh) {
    _pendingRefresh = false;
    if (!document.querySelector('dialog[open]')) _refreshFn();
    return;
  }
  // No remote changes, but widget may be stuck in "Synchronizing".
  // Recreate it so it reads current (idle) RS state → shows "Connected".
  if (_widgetContainer?.isConnected) _doAttachWidget();
}

async function saveToRemote() {
  if (!_rs?.remote.connected) return;
  try {
    await _client.storeFile('application/json', 'data.json', exportData());
  } catch { /* silently fail — data is safe in local cache */ }
}

async function fetchRemote() {
  try {
    const obj = await _client.getFile('data.json');
    return obj?.data ?? null;
  } catch { return null; }
}

function scheduleAutosave() {
  if (_syncing || _paused) return;
  saveToRemote();
}

function _showFirstConnectConflict(localRaw, remoteRaw) {
  const body = document.createElement('p');
  body.textContent = 'Your storage account already has data. Which version do you want to keep?';
  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary" id="rs-keep-local">Keep local</button>
    <button class="btn btn-primary" id="rs-use-remote">Load remote</button>
  `;
  const { close } = openModal({ title: 'Sync conflict', body, footer });
  footer.querySelector('#rs-keep-local').addEventListener('click', async () => {
    close();
    _syncing = true;
    try { loadData(localRaw); } catch { /* ignore */ }
    _syncing = false;
    await saveToRemote();
    if (!document.querySelector('dialog[open]')) _refreshFn();
  });
  footer.querySelector('#rs-use-remote').addEventListener('click', () => {
    close();
    _syncing = true;
    try { loadData(remoteRaw); } catch { /* ignore */ }
    _syncing = false;
    if (!document.querySelector('dialog[open]')) _refreshFn();
  });
}

// Pause autosave during currency migration (long async batch).
// Call resumeAutosave() when the batch is done — triggers one final save.
export function pauseAutosave() { _paused = true; }
export function resumeAutosave() { _paused = false; saveToRemote(); }

// Used before any destructive data replacement (JSON import, clear, etc.): if
// connected, shows a confirmation dialog with an optional custom message, then
// calls onConfirm() if the user proceeds (or immediately if not connected).
export function isConnected() { return !!(_rs?.remote.connected); }

export function confirmLoadIfConnected(raw, onConfirm, message) {
  if (!_rs?.remote.connected) { onConfirm(); return; }
  const body = document.createElement('p');
  body.textContent = message ?? 'You\'re connected to remote storage. This import will overwrite your remote data too. Continue?';
  const footer = document.createElement('div');
  footer.innerHTML = `
    <button class="btn btn-secondary" id="rs-cancel">Cancel</button>
    <button class="btn btn-primary" id="rs-continue">Continue</button>
  `;
  const { close } = openModal({ title: 'Overwrite remote data?', body, footer });
  footer.querySelector('#rs-cancel').addEventListener('click', close);
  footer.querySelector('#rs-continue').addEventListener('click', () => { close(); onConfirm(); });
}

function _doAttachWidget() {
  if (!_widgetContainer) return;
  _widgetContainer.innerHTML = '';
  if (!_rs) {
    const note = document.createElement('p');
    note.style.cssText = 'color:var(--text-muted);font-size:0.875rem';
    note.innerHTML = 'Sync is not available when running from <code>file://</code>. Serve the app via a local HTTP server or open from GitHub Pages to enable it.';
    _widgetContainer.appendChild(note);
    return;
  }
  const widget = new Widget(_rs);
  widget.attach(_widgetContainer);
}

export function attachWidget(container) {
  _widgetContainer = container;
  _doAttachWidget();
}
