// Menu item matching, shared by the station (browser), the Durable Object and the eval.
// NFD splits "crème brûlée" into base letters + combining marks; this strips the marks, so
// accented speech ("creme brulee") and the menu spelling normalise to the same string.
const COMBINING_MARKS = /[\u0300-\u036f]/g; // U+0300-U+036F: the marks normalize('NFD') peels off the base letters
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').replace(/[^a-z0-9]+/g, ' ').trim();

function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

// Returns { item } or { options } (ambiguous / unknown). Order: exact name/id, alias, substring, edit distance <= 2.
// Names are normalised once per item; the four passes below then run over those, not over raw strings.
export function matchItem(items, query) {
  const q = norm(query);
  if (!q) return { options: [] };
  const rows = items.map((it) => ({ it, names: [norm(it.name), norm(it.id), ...(it.aliases || []).map(norm)] }));
  const pick = (hits) => (hits.length === 1 ? { item: hits[0] } : hits.length ? { options: hits.map((h) => h.name) } : null);
  const byName = (test) => rows.filter((r) => test(r)).map((r) => r.it);
  return (
    pick(byName((r) => r.names[0] === q || r.names[1] === q)) ||
    pick(byName((r) => r.names.includes(q))) ||
    pick(byName((r) => r.names.some((n) => n.includes(q) || (n.length > 3 && q.includes(n))))) ||
    pick(byName((r) => r.names.some((n) => lev(n, q) <= (q.length > 5 ? 2 : 1)))) || { options: [] }
  );
}
