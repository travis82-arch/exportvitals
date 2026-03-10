const formatTime = (ts) => {
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

export function renderAxisLineChart({ title, series = [], xStartMs, xEndMs, yLabel = '', formatY = (v) => String(Math.round(v)), height = 220 }) {
  const width = 100;
  const left = 14;
  const right = 4;
  const top = 8;
  const bottom = 16;
  const chartW = width - left - right;
  const chartH = 100 - top - bottom;
  const values = series.map((p) => p?.v).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  if (!values.length || !Number.isFinite(xStartMs) || !Number.isFinite(xEndMs) || xEndMs <= xStartMs) {
    return `<div class="kpi"><div class="kpi-label">${title}</div><div class="placeholder">No data in selected range</div></div>`;
  }
  const yMin = Math.min(...values);
  const yMax = Math.max(...values);
  const yMid = (yMin + yMax) / 2;
  const span = Math.max(yMax - yMin, 1);

  const xPos = (tMs) => left + ((tMs - xStartMs) / (xEndMs - xStartMs)) * chartW;
  const yPos = (v) => top + (1 - ((v - yMin) / span)) * chartH;

  const segments = [];
  let curr = [];
  for (const point of series) {
    if (point?.v == null || !Number.isFinite(Number(point.v)) || !Number.isFinite(point?.tMs)) {
      if (curr.length > 1) segments.push(curr);
      curr = [];
      continue;
    }
    curr.push(`${xPos(point.tMs)},${yPos(Number(point.v))}`);
  }
  if (curr.length > 1) segments.push(curr);

  return `<section class="readiness-detail-card">
    <div class="readiness-detail-header"><div class="readiness-detail-title">${title}</div><div class="small muted">${yLabel}</div></div>
    <svg class="readiness-chart" viewBox="0 0 100 100" preserveAspectRatio="none" style="height:${height}px">
      <line x1="${left}" y1="${top}" x2="${left}" y2="${top + chartH}" stroke="rgba(255,255,255,.4)"/>
      <line x1="${left}" y1="${top + chartH}" x2="${left + chartW}" y2="${top + chartH}" stroke="rgba(255,255,255,.4)"/>
      <line x1="${left}" y1="${top}" x2="${left + chartW}" y2="${top}" stroke="rgba(255,255,255,.12)"/>
      <line x1="${left}" y1="${top + chartH / 2}" x2="${left + chartW}" y2="${top + chartH / 2}" stroke="rgba(255,255,255,.12)"/>
      ${segments.map((seg) => `<polyline fill="none" stroke="#f3f4f6" stroke-width="1.2" points="${seg.join(' ')}"></polyline>`).join('')}
      <text x="1" y="${top + 2}" font-size="3" fill="#d1d5db">${formatY(yMax)}</text>
      <text x="1" y="${top + chartH / 2 + 1}" font-size="3" fill="#d1d5db">${formatY(yMid)}</text>
      <text x="1" y="${top + chartH}" font-size="3" fill="#d1d5db">${formatY(yMin)}</text>
      <text x="${left}" y="98" font-size="3" fill="#d1d5db">${formatTime(xStartMs)}</text>
      <text x="${left + chartW / 2}" y="98" text-anchor="middle" font-size="3" fill="#d1d5db">${formatTime((xStartMs + xEndMs) / 2)}</text>
      <text x="${left + chartW}" y="98" text-anchor="end" font-size="3" fill="#d1d5db">${formatTime(xEndMs)}</text>
    </svg>
  </section>`;
}
