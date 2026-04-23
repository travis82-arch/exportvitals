import { RANGE_PRESETS, compactRangeLabel } from '../state/selectedRange.js';

function clampToAvailable(value, availableDates) {
  if (!value || !availableDates.length) return availableDates.at(-1) || null;
  if (availableDates.includes(value)) return value;
  const sorted = [...availableDates].sort();
  if (value < sorted[0]) return sorted[0];
  if (value > sorted.at(-1)) return sorted.at(-1);
  return sorted.find((date) => date >= value) || sorted.at(-1);
}

export function renderDateRangeControl(target, { range, availableDates, onChange }) {
  if (!target) return;

  const disabled = !availableDates.length || range?.disabled;
  const selectedPreset = range?.preset || 'latest-day';
  const activeRangeLabel = compactRangeLabel(range);
  const isCustom = selectedPreset === 'custom';

  target.className = 'date-range-control';
  target.innerHTML = `
    <div class="row compact-range-row compact-range-top">
      <select class="compact-select" data-role="preset" aria-label="Date range preset" ${disabled ? 'disabled' : ''}>
        ${RANGE_PRESETS.map((preset) => `<option value="${preset.key}" ${selectedPreset === preset.key ? 'selected' : ''}>${preset.label}</option>`).join('')}
      </select>
      ${isCustom ? `<span class="range-pill" title="${activeRangeLabel}">${activeRangeLabel}</span>` : ''}
      <button type="button" class="btn secondary compact-custom-trigger ${isCustom ? '' : 'is-hidden'}" data-role="custom-open" ${disabled ? 'disabled' : ''}>Edit</button>
    </div>
    <div class="custom-range-panel is-hidden" data-role="custom-panel" aria-label="Custom date selector">
      <div class="range-picker-mode" data-role="mode">
        <button type="button" data-mode="single" class="${range?.isSingleDay ? 'active' : ''}">Single date</button>
        <button type="button" data-mode="range" class="${range?.isSingleDay ? '' : 'active'}">Date range</button>
      </div>
      <div class="custom-range-fields">
        <label>Start
          <input type="date" data-role="start" min="${availableDates[0] || ''}" max="${availableDates.at(-1) || ''}" value="${range?.start || availableDates.at(-1) || ''}" ${disabled ? 'disabled' : ''} />
        </label>
        <label data-role="end-wrap">End
          <input type="date" data-role="end" min="${availableDates[0] || ''}" max="${availableDates.at(-1) || ''}" value="${range?.end || range?.start || availableDates.at(-1) || ''}" ${disabled ? 'disabled' : ''} />
        </label>
      </div>
      <div class="row compact-range-row">
        <button type="button" class="btn secondary" data-role="cancel">Cancel</button>
        <button type="button" class="btn" data-role="apply">Apply</button>
      </div>
    </div>
  `;

  const presetSelect = target.querySelector('[data-role="preset"]');
  const customOpenBtn = target.querySelector('[data-role="custom-open"]');
  const panel = target.querySelector('[data-role="custom-panel"]');
  const modeWrap = target.querySelector('[data-role="mode"]');
  const endWrap = target.querySelector('[data-role="end-wrap"]');
  const startInput = target.querySelector('[data-role="start"]');
  const endInput = target.querySelector('[data-role="end"]');
  const applyBtn = target.querySelector('[data-role="apply"]');
  const cancelBtn = target.querySelector('[data-role="cancel"]');

  let customMode = range?.isSingleDay ? 'single' : 'range';
  const syncModeUi = () => {
    modeWrap?.querySelectorAll('button').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-mode') === customMode);
    });
    if (endWrap) endWrap.classList.toggle('is-hidden', customMode === 'single');
  };
  syncModeUi();

  modeWrap?.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      customMode = button.getAttribute('data-mode') === 'single' ? 'single' : 'range';
      syncModeUi();
    });
  });

  const togglePanel = (open) => panel?.classList.toggle('is-hidden', !open);

  customOpenBtn?.addEventListener('click', () => togglePanel(true));
  cancelBtn?.addEventListener('click', () => togglePanel(false));

  applyBtn?.addEventListener('click', () => {
    const start = clampToAvailable(startInput?.value, availableDates);
    const endRaw = customMode === 'single' ? start : clampToAvailable(endInput?.value, availableDates);
    if (!start || !endRaw) return;
    const normalizedStart = start <= endRaw ? start : endRaw;
    const normalizedEnd = endRaw >= start ? endRaw : start;
    onChange?.({ preset: 'custom', start: normalizedStart, end: normalizedEnd });
    togglePanel(false);
  });

  presetSelect?.addEventListener('change', () => {
    const nextPreset = presetSelect.value;
    if (nextPreset === 'custom') {
      togglePanel(true);
      return;
    }
    togglePanel(false);
    onChange?.({ preset: nextPreset });
  });
}
