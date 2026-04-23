import { niceDomain } from './scale.js';

const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function renderAxisLineChart({ title, series = [], yUnit = '', yDomainConfig = {}, height = 160, xTickFormatter = fmtTime }) {
  const clean = (series || []).filter((p) => Number.isFinite(p?.tMs));
  const vals = clean.map((p) => p?.v).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!clean.length || !vals.length) return `<div class="kpi"><div class="kpi-label">${title}</div><div class="placeholder">No data in selected range</div></div>`;

  const xMin = clean[0].tMs;
  const xMax = clean.at(-1).tMs;
  const y = niceDomain(Math.min(...vals), Math.max(...vals), yDomainConfig);
  const m = { l: 58, r: 14, t: 12, b: 28 };
  const w = 384;
  const h = 136;
  const plotW = w - m.l - m.r;
  const plotH = h - m.t - m.b;
  const xPos = (t) => m.l + ((t - xMin) / Math.max(xMax - xMin, 1)) * plotW;
  const yPos = (v) => m.t + (1 - (v - y.min) / Math.max(y.max - y.min, 1)) * plotH;

  const segs = [];
  let run = [];
  for (const p of clean) {
    if (!Number.isFinite(Number(p?.v))) {
      if (run.length > 1) segs.push(run);
      run = [];
      continue;
    }
    run.push(`${xPos(p.tMs)},${yPos(Number(p.v))}`);
  }
  if (run.length > 1) segs.push(run);

  const label = (v) => `${Math.round(v)}${yUnit ? ` ${yUnit}` : ''}`;
  return `<section class="chart-card"><div class="kpi-label">${title}</div>
  <svg class="axis-chart" viewBox="0 0 ${w} ${h}" style="height:${height}px">
    ${y.ticks.map((t) => `<line x1="${m.l}" y1="${yPos(t)}" x2="${w - m.r}" y2="${yPos(t)}" class="grid-line"></line><text x="${m.l - 6}" y="${yPos(t) + 3}" text-anchor="end" class="tick">${label(t)}</text>`).join('')}
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" class="axis-line"></line>
    <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" class="axis-line"></line>
    ${segs.map((seg) => `<polyline fill="none" stroke="var(--accent)" stroke-width="1.5" points="${seg.join(' ')}"></polyline>`).join('')}
    <text x="${m.l}" y="${h - 6}" class="tick">${xTickFormatter(xMin, 0, clean)}</text>
    <text x="${m.l + plotW / 2}" y="${h - 6}" text-anchor="middle" class="tick">${xTickFormatter((xMin + xMax) / 2, 1, clean)}</text>
    <text x="${w - m.r}" y="${h - 6}" text-anchor="end" class="tick">${xTickFormatter(xMax, 2, clean)}</text>
  </svg></section>`;
}
