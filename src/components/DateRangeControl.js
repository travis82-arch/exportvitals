import { RANGE_PRESETS, summarizeRange } from '../state/selectedRange.js';

export function renderDateRangeControl(target, { range, availableDates, onChange }) {
  if (!target) return;

  const disabled = !availableDates.length || range?.disabled;
  const selectedPreset = range?.preset || 'latest-day';
  const minDate = availableDates[0] || '';
  const maxDate = availableDates.at(-1) || '';

  target.className = 'date-range-control card';
  target.innerHTML = `
    <div class="row split-row compact-range-row compact-range-top">
      <select class="compact-select" data-role="preset" aria-label="Date range preset" ${disabled ? 'disabled' : ''}>
        ${RANGE_PRESETS.map((preset) => `<option value="${preset.key}" ${selectedPreset === preset.key ? 'selected' : ''}>${preset.label}</option>`).join('')}
      </select>
      <span class="small muted range-active-date">${summarizeRange(range)}</span>
    </div>
    ${selectedPreset === 'custom'
      ? `<div class="row compact-range-row compact-range-custom">
          <label class="small muted">Start <input type="date" data-role="start" min="${minDate}" max="${maxDate}" value="${range?.start || ''}" ${disabled ? 'disabled' : ''}></label>
          <label class="small muted">End <input type="date" data-role="end" min="${minDate}" max="${maxDate}" value="${range?.end || ''}" ${disabled ? 'disabled' : ''}></label>
        </div>`
      : ''}
  `;

  const presetSelect = target.querySelector('[data-role="preset"]');
  presetSelect?.addEventListener('change', () => onChange?.({ preset: presetSelect.value }));

  const startInput = target.querySelector('[data-role="start"]');
  const endInput = target.querySelector('[data-role="end"]');

  startInput?.addEventListener('change', () => onChange?.({ preset: 'custom', start: startInput.value, end: endInput?.value || null }));
  endInput?.addEventListener('change', () => onChange?.({ preset: 'custom', start: startInput?.value || null, end: endInput.value }));
}
