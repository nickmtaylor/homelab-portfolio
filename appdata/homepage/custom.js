// Quick-launch search palette, adapted from the GexZ LabZ theme's search
// box. Self-contained: scans the page's own service/bookmark links, so it
// needs no backend and doesn't touch or hide any native Homepage markup —
// safe against Homepage frontend changes. Open with "/" or Ctrl/Cmd+K.
(function () {
  'use strict';

  const safe = (value) => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function catalog() {
    const found = new Map();
    document.querySelectorAll('a[href]').forEach(anchor => {
      const href = anchor.href;
      const name = (anchor.querySelector('.service-title, h3, h2')?.textContent || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      if (!name || /\.(png|svg|jpe?g|webp)$/i.test(name) || !/^https?:/.test(href) || href === location.href) return;
      const key = href.replace(/\/$/, '').toLowerCase();
      if (!found.has(key)) found.set(key, { name, url: href, hint: new URL(href).hostname });
    });
    return [...found.values()];
  }

  function build() {
    if (document.querySelector('.qs-trigger')) return;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'qs-trigger';
    trigger.setAttribute('aria-label', 'Quick launch (/ or Ctrl+K)');
    trigger.textContent = '⌕';
    document.body.appendChild(trigger);

    const overlay = document.createElement('div');
    overlay.className = 'qs-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="qs-box">
        <input class="qs-input" autocomplete="off" placeholder="Jump to a service…">
        <div class="qs-results"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.qs-input');
    const results = overlay.querySelector('.qs-results');
    let items = [], selected = -1;

    function open() {
      overlay.hidden = false;
      input.value = '';
      input.focus();
      draw();
    }
    function close() { overlay.hidden = true; }

    function draw() {
      const q = input.value.trim().toLowerCase();
      items = q ? catalog().filter(item => `${item.name} ${item.url}`.toLowerCase().includes(q)).slice(0, 8) : catalog().slice(0, 8);
      results.innerHTML = items.length
        ? items.map((item, index) => `<button type="button" class="qs-item${index === selected ? ' selected' : ''}" data-index="${index}"><span><strong>${safe(item.name)}</strong><small>${safe(item.hint)}</small></span><span>↗</span></button>`).join('')
        : '<div class="qs-empty">No matching service</div>';
    }

    function launch(index) {
      const item = items[index >= 0 ? index : 0];
      if (item) { window.open(item.url, '_blank', 'noopener'); close(); }
    }

    trigger.addEventListener('click', open);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    input.addEventListener('input', () => { selected = -1; draw(); });
    results.addEventListener('click', event => { const button = event.target.closest('[data-index]'); if (button) launch(Number(button.dataset.index)); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); selected = (selected + 1) % items.length; draw(); }
      else if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); selected = (selected - 1 + items.length) % items.length; draw(); }
      else if (event.key === 'Enter' && items.length) { event.preventDefault(); launch(selected); }
      else if (event.key === 'Escape') { close(); }
    });
    document.addEventListener('keydown', event => {
      if (overlay.hidden && ((event.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))) {
        event.preventDefault();
        open();
      } else if (!overlay.hidden && event.key === 'Escape') {
        close();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true }); else build();
})();

// System panel: NAS hardware stats (CPU/temp/mem/storage) with history
// graphs for CPU% and CPU temp, plus a combined date/time + weather
// block, from system-metrics-collector (compose/glances/). The graphs
// need real chart rendering, which Homepage's native widgets can't do
// (confirmed against docs — customapi only shows flat stat fields), so
// it's hand-built DOM/SVG. Date/time/weather used to be Homepage's own
// native `datetime`/`openmeteo` info-widgets, rendered in a separate bar
// below this panel — moved in here per feedback that they belonged in
// the same toolbar as the hardware stats, in a specific order. They
// couldn't just be CSS-repositioned into this panel: Homepage's native
// widgets live deep inside its own React tree, not as a sibling this
// panel could reach with `order`, and physically moving that *live* DOM
// node here would fight React's own reconciliation on its next re-render
// (the clock re-renders roughly every minute) — so the clock is
// reimplemented here with plain JS, and weather is fetched from this
// panel's own collector endpoint instead of Homepage's widget.
//
// Inserted as `#inner_wrapper`'s FIRST child, not document.body's.
// Confirmed against Homepage's source: the actual page scroll happens
// inside `<div id="inner_wrapper" class="... h-full overflow-auto">`
// (rendered by its `Wrapper` component), not on the window/body — `html`,
// `body`, and `#__next` are all just `height: 100%` with no overflow of
// their own. An earlier version of this panel sat as document.body's
// first child, a sibling to `#inner_wrapper` itself — outside the
// scrollable area entirely, so it stayed pinned at the top instead of
// scrolling away with the rest of the page. Moving one level deeper, to
// `#inner_wrapper`'s first child, fixes that while keeping the same
// safety property that mattered originally: `Wrapper` (and therefore
// `#inner_wrapper`) isn't torn down on tab switches — only the
// `#layout-groups` content deeper inside `Home` is — so this still sits
// outside the part of the tree that actually gets rebuilt. Falls back to
// document.body if `#inner_wrapper` is ever renamed/removed upstream,
// rather than silently doing nothing.
//
// The collector binds 0.0.0.0:9200 (LAN-reachable, not just localhost —
// a deliberate exception, since this data is fetched by the *browser*,
// not another container, and read-only hardware stats are low-risk to
// expose compared to the Docker-API-touching services elsewhere in this
// stack). Fetches the current host by hostname, so it works correctly
// when viewing the dashboard at its LAN address (192.168.1.10:3000) and
// fails closed (shows "—", not an error) over remote/cellular access via
// dash.example.com, since port 9200 was never forwarded there — that's
// expected, not a bug: this panel is a LAN-only convenience. Weather
// stays fetched server-side by the collector (not straight from Open-
// Meteo here in the browser) so the home coordinates never appear in a
// browser network request — the native widget this replaces had that
// same property, and moving the panel shouldn't regress it.
(function () {
  'use strict';

  const METRICS_PORT = 9200;
  const POLL_MS = 10000;
  const WEATHER_POLL_MS = 5 * 60 * 1000;
  const TB = 1000 ** 4; // decimal TB, matching how drive capacities are marketed

  function metricsBase() {
    return `${window.location.protocol}//${window.location.hostname}:${METRICS_PORT}`;
  }

  async function fetchJSON(path) {
    const response = await fetch(`${metricsBase()}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  }

  function fmt(value, suffix = '') {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '—';
  }

  function fmtStorage(disk) {
    if (!disk || typeof disk.used_bytes !== 'number' || typeof disk.size_bytes !== 'number') return '—';
    const used = disk.used_bytes / TB;
    const remaining = (disk.size_bytes - disk.used_bytes) / TB;
    return `${used.toFixed(2)} TB used / ${remaining.toFixed(2)} TB remaining`;
  }

  function formatClock() {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
  }

  // Small hand-drawn glyphs standing in for the icon the native openmeteo
  // widget used to show next to its condition text — that widget's own
  // icon set isn't something this project vendors, so these are simple
  // stroke-based equivalents, picked by keyword from the condition text
  // the collector already returns (see WMO_CONDITIONS server-side).
  const WEATHER_ICONS = {
    sun: '<svg viewBox="0 0 24 24" class="sys-weather-icon" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="4.2"/><path stroke-linecap="round" d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/></svg>',
    cloud: '<svg viewBox="0 0 24 24" class="sys-weather-icon" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linejoin="round" d="M7 17h9a4 4 0 0 0 .4-8 5 5 0 0 0-9.6 1.2A3.5 3.5 0 0 0 7 17Z"/></svg>',
    rain: '<svg viewBox="0 0 24 24" class="sys-weather-icon" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linejoin="round" d="M7 14h9a4 4 0 0 0 .4-8 5 5 0 0 0-9.6 1.2A3.5 3.5 0 0 0 7 14Z"/><path stroke-linecap="round" d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/></svg>',
    snow: '<svg viewBox="0 0 24 24" class="sys-weather-icon" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linejoin="round" d="M7 13h9a4 4 0 0 0 .4-8 5 5 0 0 0-9.6 1.2A3.5 3.5 0 0 0 7 13Z"/><path stroke-linecap="round" d="M12 16v6M9.3 17.5l5.4 3M14.7 17.5l-5.4 3"/></svg>',
    fog: '<svg viewBox="0 0 24 24" class="sys-weather-icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 10h16M6 14h12M4 18h16"/></svg>',
    thunder: '<svg viewBox="0 0 24 24" class="sys-weather-icon" fill="none" stroke="currentColor" stroke-width="1.6"><path stroke-linejoin="round" d="M7 13h8a4 4 0 0 0 .4-8 5 5 0 0 0-9.6 1.2A3.5 3.5 0 0 0 7 13Z"/><path stroke-linejoin="round" stroke-linecap="round" d="M13 14l-3 4h3l-2 4"/></svg>',
  };

  function weatherIcon(condition) {
    const c = (condition || '').toLowerCase();
    if (c.includes('thunderstorm')) return WEATHER_ICONS.thunder;
    if (c.includes('snow')) return WEATHER_ICONS.snow;
    if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return WEATHER_ICONS.rain;
    if (c.includes('fog')) return WEATHER_ICONS.fog;
    if (c.includes('cloud') || c.includes('overcast')) return WEATHER_ICONS.cloud;
    return WEATHER_ICONS.sun;
  }

  function donutChart(percent) {
    const clamped = Math.max(0, Math.min(100, typeof percent === 'number' ? percent : 0));
    const size = 56, stroke = 7, radius = (size - stroke) / 2, center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const used = (clamped / 100) * circumference;
    return `<svg viewBox="0 0 ${size} ${size}" class="sys-donut">
      <circle cx="${center}" cy="${center}" r="${radius}" class="sys-donut-track" stroke-width="${stroke}" fill="none"/>
      <circle cx="${center}" cy="${center}" r="${radius}" class="sys-donut-value" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${used.toFixed(1)} ${circumference.toFixed(1)}"
        transform="rotate(-90 ${center} ${center})"/>
    </svg>`;
  }

  function sparkline(values) {
    const width = 220, height = 46, pad = 3;
    const points = [];
    values.forEach((value, index) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      points.push([index, value]);
    });
    if (points.length < 2) return '<div class="sys-chart-empty">Collecting data&hellip;</div>';
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const range = maxY - minY || 1;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const spanX = maxX - minX || 1;
    const usable = height - pad * 2;
    const coords = points
      .map(([x, y]) => {
        const px = pad + ((x - minX) / spanX) * (width - pad * 2);
        const py = height - pad - ((y - minY) / range) * usable;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" class="sys-chart" preserveAspectRatio="none"><polyline points="${coords}"/></svg>`;
  }

  function build() {
    if (document.getElementById('system-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'system-panel';
    panel.innerHTML = `
      <div class="sys-inner">
        <div class="sys-stats">
          <div class="sys-stat">
            <div class="sys-stat-top"><span class="sys-value" id="sys-cpu">&mdash;</span><span class="sys-label">CPU</span></div>
            <div class="sys-chart-wrap" id="sys-cpu-chart"></div>
          </div>
          <div class="sys-stat">
            <div class="sys-stat-top"><span class="sys-value" id="sys-temp">&mdash;</span><span class="sys-label">CPU Temp</span></div>
            <div class="sys-chart-wrap" id="sys-temp-chart"></div>
          </div>
          <div class="sys-stat sys-stat-plain sys-stat-datetime">
            <div class="sys-weather-icon-wrap" id="sys-weather-icon"></div>
            <span class="sys-datetime" id="sys-datetime">&mdash;</span>
            <span class="sys-weather" id="sys-weather">&mdash;</span>
          </div>
          <div class="sys-stat sys-stat-plain">
            <span class="sys-value" id="sys-mem">&mdash;</span><span class="sys-label">Memory</span>
          </div>
          <div class="sys-stat sys-stat-plain sys-stat-storage">
            <div class="sys-donut-wrap" id="sys-disk-chart"></div>
            <div class="sys-storage-text">
              <span class="sys-value sys-value-storage" id="sys-disk">&mdash;</span>
              <span class="sys-label">Storage</span>
            </div>
          </div>
        </div>
      </div>`;
    const scrollParent = document.getElementById('inner_wrapper') || document.body;
    scrollParent.insertBefore(panel, scrollParent.firstChild);

    function tickClock() {
      const el = document.getElementById('sys-datetime');
      if (el) el.textContent = formatClock();
    }

    async function refreshWeather() {
      const el = document.getElementById('sys-weather');
      const iconEl = document.getElementById('sys-weather-icon');
      if (!el) return;
      try {
        const weather = await fetchJSON('/weather');
        el.textContent = weather.available
          ? `${weather.label}, ${fmt(weather.temp, `°${weather.unit}`)} · ${weather.condition || '—'}`
          : `${weather.label} — unavailable`;
        if (iconEl) iconEl.innerHTML = weather.available ? weatherIcon(weather.condition) : '';
      } catch (_) {
        el.textContent = 'Weather unavailable';
        if (iconEl) iconEl.innerHTML = '';
      }
    }

    async function refresh() {
      try {
        const current = await fetchJSON('/system');
        document.getElementById('sys-cpu').textContent = fmt(current.cpu_percent, '%');
        document.getElementById('sys-temp').textContent = fmt(current.cpu_temp_c, '°C');
        document.getElementById('sys-mem').textContent = fmt(current.mem_percent, '%');
        const disk = current.primary_disk;
        document.getElementById('sys-disk').textContent = fmtStorage(disk);
        document.getElementById('sys-disk-chart').innerHTML = donutChart(disk ? disk.percent : 0);

        const history = await fetchJSON('/system/history');
        document.getElementById('sys-cpu-chart').innerHTML = sparkline(history.cpu || []);
        document.getElementById('sys-temp-chart').innerHTML = sparkline(history.temp || []);
      } catch (_) {
        // Stat values simply stop updating and show stale/"—" text — no
        // separate status indicator to keep in sync now that the panel
        // no longer has its own header row.
      }
    }

    tickClock();
    setInterval(tickClock, 1000);
    refreshWeather();
    setInterval(refreshWeather, WEATHER_POLL_MS);
    refresh();
    setInterval(refresh, POLL_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build, { once: true }); else build();
})();
