// Menu item matching, shared by the station (browser), the Durable Object and the eval.
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
export function matchItem(items, query) {
  const q = norm(query);
  if (!q) return { options: [] };
  const names = (it) => [norm(it.name), norm(it.id), ...(it.aliases || []).map(norm)];
  const pick = (hits) => (hits.length === 1 ? { item: hits[0] } : hits.length ? { options: hits.map((h) => h.name) } : null);
  return (
    pick(items.filter((it) => norm(it.name) === q || norm(it.id) === q)) ||
    pick(items.filter((it) => names(it).includes(q))) ||
    pick(items.filter((it) => names(it).some((n) => n.includes(q) || (n.length > 3 && q.includes(n))))) ||
    pick(items.filter((it) => names(it).some((n) => lev(n, q) <= (q.length > 5 ? 2 : 1)))) || { options: [] }
  );
}
