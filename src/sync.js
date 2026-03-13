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
