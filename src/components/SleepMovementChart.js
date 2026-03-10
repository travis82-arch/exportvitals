const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function renderSleepMovementChart(series = []) {
  const clean = series.filter((p) => Number.isFinite(p?.tMs) && p?.v != null && Number.isFinite(Number(p.v)));
  if (!clean.length) return `<div class="kpi"><div class="kpi-label">Movement</div><div class="placeholder">Not available in this export</div></div>`;
  const xStartMs = clean[0].tMs;
  const xEndMs = clean.at(-1).tMs;
  const left = 16;
  const right = 4;
  const chartW = 100 - left - right;
  const yTop = 8;
  const yBase = 84;
  const xPos = (t) => left + ((t - xStartMs) / Math.max(xEndMs - xStartMs, 1)) * chartW;
  const yPos = (v) => yBase - (Math.max(0, Math.min(4, Number(v))) / 4) * (yBase - yTop);

  return `<section class="readiness-detail-card">
    <div class="readiness-detail-title">Movement</div>
    <svg class="readiness-chart" viewBox="0 0 100 100" preserveAspectRatio="none" style="height:180px">
      <line x1="${left}" y1="${yTop}" x2="${left}" y2="${yBase}" stroke="rgba(255,255,255,.4)"/>
      <line x1="${left}" y1="${yBase}" x2="${left + chartW}" y2="${yBase}" stroke="rgba(255,255,255,.4)"/>
      ${[0, 1, 2, 3, 4].map((v) => `<text x="1" y="${yPos(v)}" font-size="3" fill="#d1d5db">${v}</text>`).join('')}
      ${clean.map((p) => `<line x1="${xPos(p.tMs)}" x2="${xPos(p.tMs)}" y1="${yBase}" y2="${yPos(p.v)}" stroke="rgba(253,224,71,.75)"/>`).join('')}
      <text x="${left}" y="98" font-size="3" fill="#d1d5db">${formatTime(xStartMs)}</text>
      <text x="${left + chartW / 2}" y="98" text-anchor="middle" font-size="3" fill="#d1d5db">${formatTime((xStartMs + xEndMs) / 2)}</text>
      <text x="${left + chartW}" y="98" text-anchor="end" font-size="3" fill="#d1d5db">${formatTime(xEndMs)}</text>
    </svg>
  </section>`;
}
