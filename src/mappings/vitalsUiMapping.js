export const vitalsUiMapping = [
  { page: 'Vitals', section: 'Nightly', element: 'RHR Night', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'night-window min bpm', fallback: 'Not in this export', notes: 'Shared selector output' },
  { page: 'Vitals', section: 'Nightly', element: 'Estimated HRV', sourcePaths: ['derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'RMSSD proxy from bpm deltas', fallback: 'Not in this export', notes: 'Shared selector output' },
  { page: 'Vitals', section: 'Nightly', element: 'SpO2 Night Avg', sourcePaths: ['dailySpo2.spo2Average'], transform: 'parseSpo2Average', fallback: 'Not in this export', notes: 'Percent' },
  { page: 'Vitals', section: 'Nightly', element: 'Temp deviation', sourcePaths: ['dailyReadiness.temperatureDeviation'], transform: 'toNumber', fallback: 'Not in this export', notes: '°C' },
  { page: 'Vitals', section: 'Baselines', element: 'RHR/HRV/SpO2 baseline + delta', sourcePaths: ['getBaseline(metric,windowDays)'], transform: 'median + day delta', fallback: 'Not in this export', notes: 'Baseline bands and deltas' }
];
