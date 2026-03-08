export const readinessUiMapping = [
  { page: 'Readiness', section: 'Score', element: 'Readiness score', sourcePaths: ['dailyReadiness.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Readiness', section: 'Hero', element: 'Readiness band label', sourcePaths: ['dailyReadiness.score'], transform: 'scoreBand(score)', fallback: 'Not available', notes: 'Optimal/Good/Fair/Pay attention' },
  { page: 'Readiness', section: 'Insight', element: 'Insight title/copy', sourcePaths: ['dailyReadiness.contributors.hrv_balance', 'dailyReadiness.temperatureDeviation', 'getBaseline(temperatureDeviation,windowDays)'], transform: 'templated narrative', fallback: 'Not in this export', notes: 'Selected day + baseline context' },
  { page: 'Readiness', section: 'Contributors', element: 'Contributors list', sourcePaths: ['dailyReadiness.contributors'], transform: 'JSON object entries', fallback: 'Not in this export', notes: 'Optional field' },
  { page: 'Readiness', section: 'Contributors', element: 'Contributor rail widths', sourcePaths: ['dailyReadiness.contributors.*'], transform: 'score -> progress percentage', fallback: '0%', notes: '0..100 clamp' },
  { page: 'Readiness', section: 'Temperature', element: 'Temperature deviation', sourcePaths: ['dailyReadiness.temperatureDeviation'], transform: 'toNumber', fallback: 'Not in this export', notes: 'C' },
  { page: 'Readiness', section: 'Baseline compare', element: 'Temperature baseline', sourcePaths: ['getBaseline(temperatureDeviation,windowDays)'], transform: 'median over window', fallback: 'Not in this export', notes: 'Shared selector' },
  { page: 'Readiness', section: 'Key metrics', element: 'Resting heart rate', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Readiness', section: 'Key metrics', element: 'Heart rate variability', sourcePaths: ['derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'toNumber', fallback: 'Not in this export', notes: 'RMSSD proxy' },
  { page: 'Readiness', section: 'Key metrics', element: 'Body temperature', sourcePaths: ['dailyReadiness.temperatureDeviation'], transform: 'signed toFixed(1)', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Readiness', section: 'Details', element: 'Lowest heart rate chart', sourcePaths: ['heartRateSeries[].bpm'], transform: 'polyline over selected night window', fallback: 'Not enough overnight points', notes: 'Downsampled points from getDay' },
  { page: 'Readiness', section: 'Details', element: 'Average HRV chart', sourcePaths: ['heartRateSeries[].bpm'], transform: 'derived rolling RMSSD proxy series', fallback: 'Not enough overnight points', notes: 'Computed in UI layer' }
];
