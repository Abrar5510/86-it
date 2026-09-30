// Shared page chrome: brand header, nav, live board status, clock and the 86 strip.
// mountChrome({ active: 'kds', title: 'Kitchen display', outs: true }) -> { setStatus, setOuts }
// Every page calls it at the top of its module script so all four screens stay consistent.

import { esc } from './board.js';
import { icon } from './icons.js';

// Static pages mark icon slots as <span data-icon="name">; fill them once the module loads.
export const hydrateIcons = (root = document) =>
  root.querySelectorAll('[data-icon]:empty').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

const NAV = [
  { href: '/station', key: 'station', label: 'Station' },
  { href: '/kds', key: 'kds', label: 'Kitchen' },
  { href: '/foh', key: 'foh', label: 'Front of house' },
  { href: '/menu', key: 'menu', label: 'Online menu' },
];

// The mark: a voice waveform struck through. Say it, and it's off the menu.
export const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0e1116"/><g fill="#fff"><rect x="7" y="13" width="3" height="6" rx="1.5"/><rect x="12" y="8" width="3" height="16" rx="1.5"/><rect x="17" y="10.5" width="3" height="11" rx="1.5"/><rect x="22" y="14" width="3" height="4" rx="1.5"/></g><path d="M7.5 25.5 24.5 6.5" stroke="#0e1116" stroke-width="5" stroke-linecap="round"/><path d="M7.5 25.5 24.5 6.5" stroke="#3d6df5" stroke-width="2.25" stroke-linecap="round"/></svg>`;

export function mountChrome({ active = '', title = '', outs = false, cta = '' } = {}) {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `
    <header class="top">
      <a class="brand" href="/" aria-label="86 It home">${LOGO}<span class="brand-name">86 It</span>${title ? `<span class="brand-sub">${esc(title)}</span>` : ''}</a>
      <span class="live" id="chrome-live" role="status" hidden><i class="dot"></i><span class="live-txt">Reconnecting</span></span>
      <nav class="nav">${nav}</nav>
      ${cta ? `<a class="btn primary top-cta" href="/station">${esc(cta)}</a>` : '<span class="clock" id="chrome-clock" aria-hidden="true"></span>'}
    </header>
    ${outs ? '<div class="eighty-six" id="outs" aria-live="polite"></div>' : ''}`);

  hydrateIcons();
  const live = document.getElementById('chrome-live');
  const clock = document.getElementById('chrome-clock');
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }); };
  if (clock) { tick(); setInterval(tick, 10_000); }

  return {
    // Connection status stays out of the way: it only appears when the link to the kitchen drops.
    setStatus(on) {
      live.hidden = on;
      live.classList.toggle('off', !on);
    },
    // The 86 strip: what's off the menu, and what's down to the last few.
    setOuts(state) {
      const el = document.getElementById('outs');
      if (!el || !state?.items) return;
      const out = state.items.filter((i) => i.out);
      const low = state.items.filter((i) => !i.out && i.count <= 3);
      el.innerHTML =
        `<span class="label">86${out.length ? ` <b class="count">${out.length}</b>` : ''}</span>` +
        (out.map((i) => `<span class="chip out">${esc(i.name)}</span>`).join('') || '<span class="chip">Nothing off the menu</span>') +
        low.map((i) => `<span class="chip low">${esc(i.name)} · ${i.count}</span>`).join('');
    },
  };
}
