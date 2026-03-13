const _LS_KEY = 'spendwich-theme';
const _listeners = [];
let _mq = null;

export function initTheme() {
  _applyPref(getThemePref());
}

export function setTheme(pref) {
  localStorage.setItem(_LS_KEY, pref);
  _applyPref(pref);
  _listeners.forEach(fn => fn());
}

export function getThemePref() {
  return localStorage.getItem(_LS_KEY) || 'auto';
}

export function isDark() {
  return document.documentElement.classList.contains('dark');
}

export function onThemeChange(fn) { _listeners.push(fn); }

function _applyPref(pref) {
  if (_mq) { _mq.removeEventListener('change', _onMqChange); _mq = null; }

  if (pref === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (pref === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    _mq = window.matchMedia('(prefers-color-scheme: dark)');
    _mq.addEventListener('change', _onMqChange);
    _applyMq();
  }
}

function _applyMq() {
  document.documentElement.classList.toggle('dark', _mq.matches);
  _listeners.forEach(fn => fn());
}

function _onMqChange() { _applyMq(); }
