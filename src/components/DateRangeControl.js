import { RANGE_PRESETS } from '../state/selectedRange.js';

export function renderDateRangeControl(target, { range, availableDates, onChange }) {
  if (!target) return;

  const disabled = !availableDates.length || range?.disabled;
  const selectedPreset = range?.preset || 'latest-day';

  target.className = 'date-range-control';
  target.innerHTML = `
    <div class="row compact-range-row compact-range-top">
      <select class="compact-select" data-role="preset" aria-label="Date range preset" ${disabled ? 'disabled' : ''}>
        ${RANGE_PRESETS.map((preset) => `<option value="${preset.key}" ${selectedPreset === preset.key ? 'selected' : ''}>${preset.label}</option>`).join('')}
      </select>
    </div>
  `;

  const presetSelect = target.querySelector('[data-role="preset"]');
  presetSelect?.addEventListener('change', () => onChange?.({ preset: presetSelect.value }));
}
