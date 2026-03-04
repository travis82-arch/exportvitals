export const byDateUiMapping = [
  { page: 'By Date', section: 'Score cards', element: 'Readiness score', sourcePaths: ['dailyReadiness.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'By Date', section: 'Score cards', element: 'Sleep score', sourcePaths: ['dailySleep.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'By Date', section: 'Score cards', element: 'Activity score', sourcePaths: ['dailyActivity.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'By Date', section: 'Nightly vitals', element: 'RHR Night', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'night-window min bpm', fallback: 'Not in this export', notes: 'Deterministic night window mode' },
  { page: 'By Date', section: 'Nightly vitals', element: 'Estimated HRV', sourcePaths: ['derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'RMSSD proxy from bpm deltas', fallback: 'Not in this export', notes: 'Derived from overnight heart rate points' },
  { page: 'By Date', section: 'Quick insights', element: 'Night-window mode + points', sourcePaths: ['heartRateWindowSummary.modeUsed', 'heartRateWindowSummary.points'], transform: 'selector summary', fallback: 'Not in this export', notes: 'Debug transparency' }
];
