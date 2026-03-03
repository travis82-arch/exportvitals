function dayLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
}

export function renderDateStrip({ target, availableDates, selectedDate, onChange }) {
  if (!target) return;
  const sorted = [...new Set((availableDates || []).filter(Boolean))].sort();
  const last7 = sorted.slice(-7);
  if (!sorted.length) {
    target.innerHTML = '<div class="muted">Import data to begin.</div>';
    return;
  }
  target.innerHTML = `<div class="date-strip">${last7.map((d) => `<button class="btn ${d === selectedDate ? 'active' : ''}" data-date-chip="${d}">${dayLabel(d)}</button>`).join('')}</div>
    <div class="row"><label class="small">Pick date <input type="date" id="dateStripPicker" value="${selectedDate}" /></label></div>`;

  target.querySelectorAll('[data-date-chip]').forEach((btn) => btn.addEventListener('click', () => onChange(btn.dataset.dateChip)));
  const picker = target.querySelector('#dateStripPicker');
  picker?.addEventListener('change', (e) => onChange(e.target.value));
}
