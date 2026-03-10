const niceStep = (raw) => {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const n = raw / power;
  if (n <= 1) return 1 * power;
  if (n <= 2) return 2 * power;
  if (n <= 5) return 5 * power;
  return 10 * power;
};

export function niceDomain(min, max, { minRange = 1, padPct = 0.1, stepHint } = {}) {
  let a = Number(min);
  let b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { min: 0, max: 1, step: 0.5, ticks: [0, 0.5, 1] };
  if (a === b) {
    a -= minRange / 2;
    b += minRange / 2;
  }
  const mid = (a + b) / 2;
  const span = Math.max(Math.abs(b - a), minRange);
  const padded = span * (1 + padPct * 2);
  let lo = mid - padded / 2;
  let hi = mid + padded / 2;
  const targetTicks = 4;
  const step = stepHint || niceStep((hi - lo) / (targetTicks - 1));
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let t = lo; t <= hi + step * 0.5; t += step) ticks.push(Number(t.toFixed(6)));
  if (ticks.length < 3) {
    ticks.splice(0, ticks.length, lo, lo + step, lo + step * 2);
    hi = lo + step * 2;
  }
  if (ticks.length > 5) {
    const stride = Math.ceil(ticks.length / 5);
    const reduced = ticks.filter((_, i) => i % stride === 0);
    if (reduced.at(-1) !== ticks.at(-1)) reduced.push(ticks.at(-1));
    return { min: lo, max: hi, step, ticks: reduced };
  }
  return { min: lo, max: hi, step, ticks };
}
