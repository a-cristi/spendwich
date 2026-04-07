// Recursively normalises a parsed JSON value to a canonical form for comparison:
// - Object keys sorted alphabetically at every level
// - Arrays of id-bearing objects sorted by .id
// - Primitive arrays preserved in original order
export function normalizeForCompare(v) {
  if (Array.isArray(v)) {
    const items = v.map(normalizeForCompare);
    return items[0]?.id !== undefined
      ? items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      : items;
  }
  if (v !== null && typeof v === 'object') {
    const out = {};
    Object.keys(v).sort().forEach(k => { out[k] = normalizeForCompare(v[k]); });
    return out;
  }
  return v;
}

// Returns true if a JSON string contains any user data (transactions, categories, or labels).
export function rawHasData(raw) {
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    return d.transactions?.length > 0 || d.categories?.length > 0 || d.labels?.length > 0;
  } catch { return false; }
}

// Returns the parsed object, or null if raw is null or not valid JSON.
function tryParse(raw) {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// Given two JSON strings (local and remote), returns the action that reconciliation
// should take: 'conflict' | 'load-remote' | 'push-local' | 'in-sync'.
//
// 'load-remote' fires when local has no usable state (null or unparseable JSON).
// Any valid non-null local state that differs from remote returns 'conflict',
// including settings-only differences, so the user is always asked rather than
// having local changes silently overwritten.
export function decideReconcileAction(localRaw, remoteRaw) {
  if (isSameData(localRaw, remoteRaw)) return 'in-sync';
  if (!remoteRaw) return rawHasData(localRaw) ? 'push-local' : 'in-sync';
  if (tryParse(localRaw) === null) return 'load-remote';
  return 'conflict';
}

// Returns true if two JSON strings represent semantically equivalent data,
// regardless of key order or entity array order.
export function isSameData(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;  // fast path: byte-identical (common auto-reconnect case)
  try {
    return JSON.stringify(normalizeForCompare(JSON.parse(a))) ===
           JSON.stringify(normalizeForCompare(JSON.parse(b)));
  } catch { return false; }
}
