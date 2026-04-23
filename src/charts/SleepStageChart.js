const STAGES = ['Awake', 'REM', 'Light', 'Deep'];
const Y = { Awake: 12, REM: 34, Light: 56, Deep: 78 };
const COLORS = { Awake: '#fca5a5', REM: '#c4b5fd', Light: '#93c5fd', Deep: '#60a5fa' };
const fmtTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function renderSleepStageChart({ title = 'Sleep stages', stages = [], height = 160 }) {
  if (!stages.length) return `<div class="kpi"><div class="kpi-label">${title}</div><div class="placeholder">No data in selected range</div></div>`;
  const start = stages[0].startMs;
  const end = stages.at(-1).endMs;
  const m = { l: 58, r: 14, t: 12, b: 28 };
  const w = 384;
  const h = 136;
  const plotW = w - m.l - m.r;
  const xPos = (t) => m.l + ((t - start) / Math.max(end - start, 1)) * plotW;
  return `<section class="chart-card"><div class="kpi-label">${title}</div><svg class="axis-chart" viewBox="0 0 ${w} ${h}" style="height:${height}px">
    ${STAGES.map((s) => `<line x1="${m.l}" y1="${Y[s]}" x2="${w - m.r}" y2="${Y[s]}" class="grid-line"></line><text x="${m.l - 6}" y="${Y[s] + 3}" text-anchor="end" class="tick">${s}</text>`).join('')}
    <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" class="axis-line"></line>
    <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" class="axis-line"></line>
    ${stages.map((seg) => `<rect x="${xPos(seg.startMs)}" y="${Y[seg.stage] - 7}" width="${Math.max(1, xPos(seg.endMs) - xPos(seg.startMs))}" height="13" fill="${COLORS[seg.stage] || '#93c5fd'}"></rect>`).join('')}
    <text x="${m.l}" y="${h - 6}" class="tick">${fmtTime(start)}</text>
    <text x="${m.l + plotW / 2}" y="${h - 6}" text-anchor="middle" class="tick">${fmtTime((start + end) / 2)}</text>
    <text x="${w - m.r}" y="${h - 6}" text-anchor="end" class="tick">${fmtTime(end)}</text>
  </svg></section>`;
}
