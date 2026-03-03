export const sleepUiMapping = [
  { page: 'Sleep', section: 'Score', element: 'Sleep score', sourcePaths: ['dailySleep.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Sleep', section: 'Contributors', element: 'Contributors list', sourcePaths: ['dailySleep.contributors'], transform: 'JSON object entries', fallback: 'Not in this export', notes: 'Optional in export' },
  { page: 'Sleep', section: 'Overnight vitals', element: 'RHR Night', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'night-window min bpm', fallback: 'Not in this export', notes: 'Prefers sleep_time session' },
  { page: 'Sleep', section: 'Overnight vitals', element: 'HRV proxy', sourcePaths: ['derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'RMSSD proxy from bpm deltas', fallback: 'Not in this export', notes: 'Heart-rate derived' },
  { page: 'Sleep', section: 'Breathing', element: 'SpO2 average', sourcePaths: ['dailySpo2.spo2Average'], transform: 'parseSpo2Average', fallback: 'Not in this export', notes: 'Percent' },
  { page: 'Sleep', section: 'Breathing', element: 'Breathing regularity (BDI)', sourcePaths: ['dailySpo2.breathing_disturbance_index'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Lower tends to be better' },
  { page: 'Sleep', section: 'Unavailable in export', element: 'Sleep stage timeline', sourcePaths: ['n/a in CSV bundle'], transform: 'none', fallback: 'Not in this export', notes: 'Explicit placeholder only when source truly absent' }
];
