// Shared page chrome: brand header, nav, live board status, clock and the 86 strip.
// mountChrome({ active: 'kds', title: 'Kitchen display', outs: true }) -> { setStatus, setOuts }
// Every page calls it at the top of its module script so all four screens stay consistent.

const NAV = [
  { href: '/station', key: 'station', label: 'Station' },
  { href: '/kds', key: 'kds', label: 'Kitchen' },
  { href: '/foh', key: 'foh', label: 'Front of house' },
  { href: '/menu', key: 'menu', label: 'Online menu' },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function mountChrome({ active = '', title = '', outs = false } = {}) {
  const nav = NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  document.body.insertAdjacentHTML('afterbegin', `
    <header class="top">
      <a class="brand" href="/"><span class="mark">86</span><span class="brand-name">It</span>${title ? `<span class="brand-sub">${esc(title)}</span>` : ''}</a>
      <span class="live" id="chrome-live" title="Durable Object connection"><i class="dot"></i><span class="live-txt">connecting</span></span>
      <nav class="nav">${nav}</nav>
      <span class="clock" id="chrome-clock" aria-hidden="true"></span>
    </header>
    ${outs ? '<div class="eighty-six" id="outs" aria-live="polite"></div>' : ''}`);

  const live = document.getElementById('chrome-live');
  const clock = document.getElementById('chrome-clock');
  const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }); };
  tick();
  setInterval(tick, 10_000);

  return {
    setStatus(on) {
      live.classList.toggle('on', on);
      live.classList.toggle('off', !on);
      live.querySelector('.live-txt').textContent = on ? 'live' : 'reconnecting';
    },
    // The 86 strip: what's off the menu, and what's down to the last few.
    setOuts(state) {
      const el = document.getElementById('outs');
      if (!el || !state?.items) return;
      const out = state.items.filter((i) => i.out);
      const low = state.items.filter((i) => !i.out && i.count <= 3);
      el.innerHTML =
        `<span class="label">86${out.length ? ` <b class="count">${out.length}</b>` : ''}</span>` +
        (out.map((i) => `<span class="chip out">${esc(i.name)}</span>`).join('') || '<span class="chip">nothing off the menu</span>') +
        low.map((i) => `<span class="chip low">${esc(i.name)} · ${i.count}</span>`).join('');
    },
  };
}
