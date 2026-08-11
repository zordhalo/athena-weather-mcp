/**
 * Builds the self-contained interactive widget.
 *
 * Design decision: the entire dataset is inlined as JSON at generation time and
 * every interaction runs client-side. The widget therefore needs zero network
 * access and zero host cooperation to be fully interactive — which matters
 * because iframe CSP and host-messaging support vary between MCP hosts.
 * Host messaging (postMessage / Apps-SDK) is layered on top as an enhancement.
 */

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

/** JSON safe to drop inside a <script> block (only < and > can break out). */
const safeJSON = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

export function renderWidget(payload) {
  const title = [payload.place.name, payload.place.region, payload.place.country]
    .filter(Boolean)
    .join(', ');

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Weather Explorer — ${esc(title)}</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --panel: #f6f7f9;
    --panel-2: #eef0f4;
    --ink: #10151c;
    --ink-dim: #5c6673;
    --line: #dfe3e9;
    --accent: #2563eb;
    --accent-soft: rgba(37, 99, 235, .12);
    --sev-Extreme: #7f1d1d; --sev-Severe: #b91c1c;
    --sev-Moderate: #b45309; --sev-Minor: #0369a1; --sev-Unknown: #4b5563;
    --radius: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0e1117; --panel: #161b23; --panel-2: #1d232d;
      --ink: #e8edf4; --ink-dim: #94a1b2; --line: #262d38;
      --accent: #60a5fa; --accent-soft: rgba(96,165,250,.16);
      --sev-Extreme: #ef4444; --sev-Severe: #f87171;
      --sev-Moderate: #fbbf24; --sev-Minor: #38bdf8; --sev-Unknown: #9ca3af;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 16px; }

  header { display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
  .now-glyph { font-size: 42px; line-height: 1; }
  .place { font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
  .sub { color: var(--ink-dim); font-size: 12.5px; }
  .now-temp { margin-left: auto; text-align: right; }
  .now-temp b { font-size: 34px; font-weight: 680; letter-spacing: -.02em; }

  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
  .chip {
    background: var(--panel); border: 1px solid var(--line); color: var(--ink-dim);
    border-radius: 999px; padding: 3px 10px; font-size: 12px;
  }

  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--ink-dim); margin: 22px 0 8px; font-weight: 600;
  }

  /* ---- Interaction 1: day selector ---- */
  .days { display: grid; grid-auto-flow: column; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
  .day {
    min-width: 84px; background: var(--panel); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 10px 8px; cursor: pointer; text-align: center;
    transition: background .15s, border-color .15s, transform .12s;
  }
  .day:hover { background: var(--panel-2); transform: translateY(-1px); }
  .day[aria-selected="true"] {
    border-color: var(--accent); background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .day .dow { font-size: 11px; color: var(--ink-dim); font-weight: 600; }
  .day .g { font-size: 22px; line-height: 1.3; }
  .day .hi { font-weight: 650; }
  .day .lo { color: var(--ink-dim); }
  .day .pp { font-size: 11px; color: var(--accent); min-height: 15px; }

  /* ---- Interaction 2: metric toggle ---- */
  .metrics { display: flex; gap: 4px; background: var(--panel); border: 1px solid var(--line);
             border-radius: 999px; padding: 3px; width: fit-content; }
  .metric {
    border: 0; background: transparent; color: var(--ink-dim); cursor: pointer;
    font: inherit; font-size: 12.5px; font-weight: 600; padding: 5px 14px; border-radius: 999px;
    transition: background .15s, color .15s;
  }
  .metric[aria-pressed="true"] { background: var(--accent); color: #fff; }

  .chart-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .chart-card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius);
                padding: 12px 8px 6px; margin-top: 8px; overflow-x: auto; }
  svg { display: block; }
  .gridline { stroke: var(--line); stroke-width: 1; }
  .axis-label { fill: var(--ink-dim); font-size: 10px; }
  .hbar { fill: var(--accent); opacity: .22; transition: opacity .12s; cursor: pointer; }
  .hbar:hover { opacity: .55; }
  .hline { fill: none; stroke: var(--accent); stroke-width: 2.5;
           stroke-linejoin: round; stroke-linecap: round; }
  .hdot { fill: var(--accent); }
  .vlabel { fill: var(--ink); font-size: 10.5px; font-weight: 600; text-anchor: middle; }
  .readout { color: var(--ink-dim); font-size: 12.5px; min-height: 18px; margin-top: 6px; }
  .readout b { color: var(--ink); }

  /* ---- Interaction 3: alert expansion ---- */
  .alert {
    border: 1px solid var(--line); border-left: 4px solid var(--sev); background: var(--panel);
    border-radius: 10px; margin-bottom: 8px; overflow: hidden;
  }
  .alert-top {
    display: flex; gap: 10px; align-items: center; padding: 10px 12px;
    cursor: pointer; user-select: none;
  }
  .alert-top:hover { background: var(--panel-2); }
  .sev-tag {
    color: var(--sev); border: 1px solid var(--sev); border-radius: 5px;
    font-size: 10px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
    padding: 2px 6px; white-space: nowrap;
  }
  .alert-title { font-weight: 620; }
  .alert-area { color: var(--ink-dim); font-size: 12px; }
  .caret { margin-left: auto; color: var(--ink-dim); transition: transform .18s; flex: none; }
  .alert[open] .caret { transform: rotate(90deg); }
  .alert-body { display: none; padding: 0 12px 12px; border-top: 1px solid var(--line); }
  .alert[open] .alert-body { display: block; }
  .alert-body p { white-space: pre-wrap; font-size: 12.5px; color: var(--ink-dim); margin: 10px 0 0; }
  .alert-body .instr { color: var(--ink); border-left: 2px solid var(--sev); padding-left: 10px; }
  .when { font-size: 11.5px; color: var(--ink-dim); margin-top: 8px; }

  .empty {
    background: var(--panel); border: 1px dashed var(--line); border-radius: var(--radius);
    padding: 16px; color: var(--ink-dim); font-size: 13px; text-align: center;
  }
  footer { margin-top: 20px; color: var(--ink-dim); font-size: 11px; text-align: center; }
</style>

<div class="wrap">
  <header>
    <div class="now-glyph" id="nowGlyph"></div>
    <div>
      <div class="place" id="placeName"></div>
      <div class="sub" id="placeSub"></div>
    </div>
    <div class="now-temp">
      <b id="nowTemp"></b>
      <div class="sub" id="nowFeels"></div>
    </div>
  </header>
  <div class="chips" id="chips"></div>

  <h2>7-day forecast — select a day</h2>
  <div class="days" id="days" role="tablist"></div>

  <div class="chart-head" style="margin-top:22px">
    <h2 style="margin:0" id="chartTitle">Hourly</h2>
    <div class="metrics" role="group" aria-label="Metric">
      <button class="metric" data-metric="temp" aria-pressed="true">Temp</button>
      <button class="metric" data-metric="precip" aria-pressed="false">Rain %</button>
      <button class="metric" data-metric="wind" aria-pressed="false">Wind</button>
    </div>
  </div>
  <div class="chart-card"><svg id="chart" height="180" role="img"></svg></div>
  <div class="readout" id="readout"></div>

  <h2 id="alertHead">Active alerts</h2>
  <div id="alerts"></div>

  <footer>
    Forecast: Open-Meteo · Alerts: US National Weather Service · <span id="stamp"></span>
  </footer>
</div>

<script>
const DATA = ${safeJSON(payload)};

/* ---------- optional host bridge (harmless if nothing is listening) ---------- */
function notifyHost(text) {
  const msg = { role: 'user', content: [{ type: 'text', text: text }] };
  try { window.parent && window.parent.postMessage({ type: 'tool', payload: msg, prompt: text }, '*'); } catch (e) {}
  try { window.parent && window.parent.postMessage({ type: 'mcp-ui:prompt', payload: { prompt: text } }, '*'); } catch (e) {}
  try { window.openai && window.openai.sendFollowUpMessage && window.openai.sendFollowUpMessage({ prompt: text }); } catch (e) {}
}

/* ---------- helpers ---------- */
const mk = function (tag, cls, txt) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const fmtDay = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' });
const fmtDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fmtClock = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '—';

const state = { dayIndex: 0, metric: 'temp' };
const METRICS = {
  temp:   { key: 'temp',   title: 'Hourly temperature', mode: 'line' },
  precip: { key: 'precip', title: 'Hourly chance of precipitation', mode: 'bar', max: 100 },
  wind:   { key: 'wind',   title: 'Hourly wind speed', mode: 'bar' },
};

/* ---------- header ---------- */
document.getElementById('nowGlyph').textContent = DATA.current.glyph;
document.getElementById('placeName').textContent =
  [DATA.place.name, DATA.place.region].filter(Boolean).join(', ');
document.getElementById('placeSub').textContent = DATA.place.country + ' · ' + DATA.current.label;
document.getElementById('nowTemp').textContent = DATA.current.temp + '°';
document.getElementById('nowFeels').textContent = 'Feels ' + DATA.current.feelsLike + '°';
document.getElementById('stamp').textContent = 'updated ' + fmtClock(DATA.generatedAt);

const chipsEl = document.getElementById('chips');
[
  'Humidity ' + DATA.current.humidity + '%',
  'Wind ' + DATA.current.wind + ' mph',
  'Gusts ' + DATA.current.gust + ' mph',
  DATA.alerts.length
    ? DATA.alerts.length + ' active alert' + (DATA.alerts.length > 1 ? 's' : '')
    : 'No active alerts',
].forEach((t) => chipsEl.append(mk('span', 'chip', t)));

/* ---------- INTERACTION 1: day selector ---------- */
const daysEl = document.getElementById('days');
DATA.daily.forEach((d, i) => {
  const b = mk('div', 'day');
  b.setAttribute('role', 'tab');
  b.setAttribute('aria-selected', String(i === 0));
  b.tabIndex = 0;
  b.append(mk('div', 'dow', i === 0 ? 'Today' : fmtDay(d.date)));
  b.append(mk('div', 'g', d.glyph));
  const t = mk('div');
  t.append(mk('span', 'hi', d.tempMax + '°'), document.createTextNode(' '), mk('span', 'lo', d.tempMin + '°'));
  b.append(t);
  b.append(mk('div', 'pp', d.precipChance > 0 ? '💧 ' + d.precipChance + '%' : ''));
  const pick = () => selectDay(i);
  b.addEventListener('click', pick);
  b.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
  });
  daysEl.append(b);
});

function selectDay(i) {
  state.dayIndex = i;
  const kids = daysEl.children;
  for (let n = 0; n < kids.length; n++) kids[n].setAttribute('aria-selected', String(n === i));
  draw();
  const d = DATA.daily[i];
  notifyHost(
    'Tell me more about the ' + fmtDay(d.date) + ' ' + fmtDate(d.date) + ' forecast for ' +
    DATA.place.name + ' (' + d.label + ', ' + d.tempMin + '–' + d.tempMax + '°F, ' +
    d.precipChance + '% chance of precipitation).'
  );
}

/* ---------- INTERACTION 2: metric toggle ---------- */
const metricBtns = document.querySelectorAll('.metric');
metricBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.metric = btn.dataset.metric;
    metricBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    draw();
  });
});

/* ---------- chart ---------- */
const NS = 'http://www.w3.org/2000/svg';
const sel = (tag, attrs, text) => {
  const n = document.createElementNS(NS, tag);
  Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
  if (text != null) n.textContent = text;
  return n;
};

function baseReadout(day) {
  const r = document.getElementById('readout');
  r.textContent =
    '☀️ Sunrise ' + fmtClock(day.sunrise) + ' · 🌇 Sunset ' + fmtClock(day.sunset) +
    ' · 💨 Max wind ' + day.windMax + ' mph (gusts ' + day.gustMax + ') · 🌧️ Total ' + day.precipSum + ' in';
}

function draw() {
  const day = DATA.daily[state.dayIndex];
  const all = DATA.hourlyByDate[day.date] || [];
  const hours = all.filter((_, i) => i % 2 === 0); // every 2 hours keeps labels legible
  const m = METRICS[state.metric];
  const svg = document.getElementById('chart');
  svg.textContent = '';

  document.getElementById('chartTitle').textContent =
    m.title + ' — ' + (state.dayIndex === 0 ? 'Today' : fmtDay(day.date)) + ' ' + fmtDate(day.date);
  baseReadout(day);

  if (!hours.length) {
    svg.append(sel('text', { x: 16, y: 90, class: 'axis-label' }, 'No hourly data for this day.'));
    return;
  }

  const W = Math.max(hours.length * 58, 640), H = 180;
  const padL = 12, padR = 12, padT = 26, padB = 26;
  svg.setAttribute('width', W);
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

  const vals = hours.map((h) => h[m.key]);
  let lo = Math.min.apply(null, vals);
  let hi = Math.max.apply(null, vals);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * 0.18;
  const yMin = m.max ? 0 : lo - pad;
  const yMax = m.max ? m.max : hi + pad;
  const plotH = H - padT - padB;
  const x = (i) => padL + (i + 0.5) * ((W - padL - padR) / hours.length);
  const y = (v) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  for (let g = 0; g <= 2; g++) {
    const yy = padT + (plotH / 2) * g;
    svg.append(sel('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, class: 'gridline' }));
  }

  if (m.mode === 'bar') {
    const bw = Math.min(30, (W - padL - padR) / hours.length - 10);
    hours.forEach((h, i) => {
      const yy = y(h[m.key]);
      const r = sel('rect', {
        x: x(i) - bw / 2, y: yy, width: bw,
        height: Math.max(padT + plotH - yy, 1), rx: 4, class: 'hbar',
      });
      wire(r, h, day);
      svg.append(r);
    });
  } else {
    const d = hours.map((h, i) => (i ? 'L' : 'M') + x(i) + ' ' + y(h[m.key])).join(' ');
    svg.append(sel('path', { d: d, class: 'hline' }));
    hours.forEach((h, i) => {
      svg.append(sel('circle', { cx: x(i), cy: y(h[m.key]), r: 3.5, class: 'hdot' }));
      const hit = sel('rect', {
        x: x(i) - 20, y: padT, width: 40, height: plotH,
        fill: 'transparent', style: 'cursor:pointer',
      });
      wire(hit, h, day);
      svg.append(hit);
    });
  }

  hours.forEach((h, i) => {
    svg.append(sel('text', { x: x(i), y: y(h[m.key]) - 9, class: 'vlabel' },
      h[m.key] + (m.key === 'precip' ? '%' : '')));
    svg.append(sel('text', { x: x(i), y: H - 8, class: 'axis-label', 'text-anchor': 'middle' }, h.hour));
  });
}

function wire(node, h, day) {
  node.addEventListener('mouseenter', () => {
    document.getElementById('readout').textContent =
      h.hour + ' — ' + h.temp + '°F · ' + h.precip + '% precip · ' + h.wind + ' mph wind';
  });
  node.addEventListener('mouseleave', () => baseReadout(day));
}

/* ---------- INTERACTION 3: expandable alerts ---------- */
const alertsEl = document.getElementById('alerts');
if (!DATA.alerts.length) {
  const empty = mk('div', 'empty');
  const note = mk('span', null, DATA.alertCoverage);
  note.style.fontSize = '11.5px';
  empty.append('✅ No active government weather alerts for this location.',
               document.createElement('br'), note);
  alertsEl.append(empty);
} else {
  document.getElementById('alertHead').textContent =
    'Active alerts (' + DATA.alerts.length + ') — click to expand';
  DATA.alerts.forEach((a) => {
    // NWS text is third-party input: built with textContent, never innerHTML.
    const card = mk('div', 'alert');
    card.style.setProperty('--sev', 'var(--sev-' + a.severity + ', var(--sev-Unknown))');

    const top = mk('div', 'alert-top');
    const label = mk('span');
    label.append(mk('span', 'alert-title', a.event), document.createElement('br'),
                 mk('span', 'alert-area', a.areaDesc));
    top.append(mk('span', 'sev-tag', a.severity), label, mk('span', 'caret', '›'));

    const body = mk('div', 'alert-body');
    body.append(mk('div', 'when',
      '⏱ ' + fmtTime(a.onset) + ' → ' + fmtTime(a.expires) +
      ' · urgency ' + a.urgency + ' · certainty ' + a.certainty + ' · ' + a.sender));
    if (a.description) body.append(mk('p', null, a.description));
    if (a.instruction) body.append(mk('p', 'instr', a.instruction));

    top.addEventListener('click', () => {
      if (card.hasAttribute('open')) {
        card.removeAttribute('open');
      } else {
        card.setAttribute('open', '');
        notifyHost('Explain this active weather alert for ' + DATA.place.name +
          ' and what I should do: ' + a.event + ' (' + a.severity + ') — ' +
          (a.headline || a.areaDesc));
      }
    });
    card.append(top, body);
    alertsEl.append(card);
  });
}

selectDay(0);
</script>
</html>`;
}
