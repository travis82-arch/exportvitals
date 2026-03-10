const STAGE_Y = { Awake: 8, REM: 30, Light: 52, Deep: 74 };
const stageLabelRows = [
  { label: 'Awake', y: 8 },
  { label: 'REM', y: 30 },
  { label: 'Light', y: 52 },
  { label: 'Deep', y: 74 }
];

const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function renderSleepStageChart(stages = []) {
  if (!stages.length) return `<div class="kpi"><div class="kpi-label">Sleep stages</div><div class="placeholder">Not available in this export</div></div>`;
  const xStartMs = stages[0].startMs;
  const xEndMs = stages.at(-1).endMs;
  const left = 16;
  const right = 4;
  const chartW = 100 - left - right;
  const xPos = (t) => left + ((t - xStartMs) / Math.max(xEndMs - xStartMs, 1)) * chartW;

  return `<section class="readiness-detail-card">
    <div class="readiness-detail-title">Sleep stages</div>
    <svg class="readiness-chart" viewBox="0 0 100 100" preserveAspectRatio="none" style="height:220px">
      <line x1="${left}" y1="6" x2="${left}" y2="84" stroke="rgba(255,255,255,.4)"/>
      <line x1="${left}" y1="84" x2="${left + chartW}" y2="84" stroke="rgba(255,255,255,.4)"/>
      ${stageLabelRows.map((row) => `<text x="1" y="${row.y}" font-size="3" fill="#d1d5db">${row.label}</text>`).join('')}
      ${stages.map((seg) => `<rect x="${xPos(seg.startMs)}" y="${STAGE_Y[seg.label] || 52}" width="${Math.max(0.8, xPos(seg.endMs) - xPos(seg.startMs))}" height="8" fill="rgba(147,197,253,.8)"></rect>`).join('')}
      <text x="${left}" y="98" font-size="3" fill="#d1d5db">${formatTime(xStartMs)}</text>
      <text x="${left + chartW / 2}" y="98" text-anchor="middle" font-size="3" fill="#d1d5db">${formatTime((xStartMs + xEndMs) / 2)}</text>
      <text x="${left + chartW}" y="98" text-anchor="end" font-size="3" fill="#d1d5db">${formatTime(xEndMs)}</text>
    </svg>
  </section>`;
}
