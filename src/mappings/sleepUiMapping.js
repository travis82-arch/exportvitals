export const sleepUiMapping = [
  { page: 'Sleep', section: 'Header', element: 'Sleep score', sourcePaths: ['dailySleep.score'], transform: 'toNumber', fallback: 'Not in export', notes: 'No fabricated durations' },
  { page: 'Sleep', section: 'Vitals', element: 'RHR Night', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'derived median', fallback: 'Not enough nighttime HR', notes: 'Windowed by sleep_time' },
  { page: 'Sleep', section: 'Vitals', element: 'Estimated HRV', sourcePaths: ['derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'differences RMSSD proxy', fallback: 'Not enough nighttime HR', notes: 'Proxy only' }
];
