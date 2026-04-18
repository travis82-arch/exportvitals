import { niceDomain } from './scale.js';

const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function renderAxisBarChart({ title, series = [], yTicks = null, yDomainConfig = {}, height = 150, yLabelFormatter = (v) => String(v) }) {
  const clean = (series || []).filter((p) => Number.isFinite(p?.tMs));
  const vals = clean.map((p) => p?.v ?? p?.level).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!clean.length || !vals.length) return `<div class="kpi"><div class="kpi-label">${title}</div><div class="placeholder">No data in selected range</div></div>`;
  const xMin = clean[0].tMs;
  const xMax = clean.at(-1).tMs;
  const y = yTicks ? { min: Math.min(...yTicks), max: Math.max(...yTicks), ticks: yTicks } : niceDomain(Math.min(...vals), Math.max(...vals), yDomainConfig);
  const m = { l: 40, r: 10, t: 8, b: 22 };
  const w = 360;
  const h = 120;
  const plotW = w - m.l - m.r;
  const plotH = h - m.t - m.b;
  const xPos = (t) => m.l + ((t - xMin) / Math.max(xMax - xMin, 1)) * plotW;
  const yPos = (v) => m.t + (1 - (v - y.min) / Math.max(y.max - y.min, 1)) * plotH;
  const barW = Math.max(1, plotW / Math.max(clean.length, 1) * 0.9);
  return `<section class="chart-card"><div class="kpi-label">${title}</div>
    <svg class="axis-chart" viewBox="0 0 ${w} ${h}" style="height:${height}px">
      ${y.ticks.map((t) => `<line x1="${m.l}" y1="${yPos(t)}" x2="${w - m.r}" y2="${yPos(t)}" class="grid-line"></line><text x="${m.l - 6}" y="${yPos(t) + 3}" text-anchor="end" class="tick">${yLabelFormatter(t)}</text>`).join('')}
      <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" class="axis-line"></line>
      <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" class="axis-line"></line>
      ${clean.map((p) => {
        const v = Number(p?.v ?? p?.level);
        return `<rect x="${xPos(p.tMs) - barW / 2}" y="${yPos(v)}" width="${barW}" height="${Math.max(1, h - m.b - yPos(v))}" fill="var(--chart-bar)"></rect>`;
      }).join('')}
      <text x="${m.l}" y="${h - 6}" class="tick">${fmtTime(xMin)}</text>
      <text x="${m.l + plotW / 2}" y="${h - 6}" text-anchor="middle" class="tick">${fmtTime((xMin + xMax) / 2)}</text>
      <text x="${w - m.r}" y="${h - 6}" text-anchor="end" class="tick">${fmtTime(xMax)}</text>
    </svg>
  </section>`;
}
