import { RANGE_PRESETS, summarizeRange } from '../state/selectedRange.js';

export function renderDateRangeControl(target, { range, availableDates, onChange }) {
  if (!target) return;

  const disabled = !availableDates.length || range?.disabled;
  const selectedPreset = range?.preset || 'latest-day';
  const minDate = availableDates[0] || '';
  const maxDate = availableDates.at(-1) || '';

  target.className = 'date-range-control card';
  target.innerHTML = `
    <div class="row split-row">
      <h3>Date range</h3>
      <div class="small muted">${summarizeRange(range)}</div>
    </div>
    <div class="preset-row">
      ${RANGE_PRESETS.map((preset) => `<button type="button" class="btn ${selectedPreset === preset.key ? 'active' : ''}" data-preset="${preset.key}" ${disabled ? 'disabled' : ''}>${preset.label}</button>`).join('')}
    </div>
    <div class="row">
      <label class="small muted">Start <input type="date" data-role="start" min="${minDate}" max="${maxDate}" value="${range?.start || ''}" ${disabled || selectedPreset !== 'custom' ? 'disabled' : ''}></label>
      <label class="small muted">End <input type="date" data-role="end" min="${minDate}" max="${maxDate}" value="${range?.end || ''}" ${disabled || selectedPreset !== 'custom' ? 'disabled' : ''}></label>
    </div>
  `;

  target.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => onChange?.({ preset: button.dataset.preset }));
  });

  const startInput = target.querySelector('[data-role="start"]');
  const endInput = target.querySelector('[data-role="end"]');

  startInput?.addEventListener('change', () => onChange?.({ preset: 'custom', start: startInput.value, end: endInput?.value || null }));
  endInput?.addEventListener('change', () => onChange?.({ preset: 'custom', start: startInput?.value || null, end: endInput.value }));
}
