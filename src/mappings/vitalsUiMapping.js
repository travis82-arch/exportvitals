export const vitalsUiMapping = [
  { page: 'Vitals', section: 'Nightly', element: 'RHR Night', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'night median HR', fallback: 'Not enough nighttime HR', notes: 'sleep_time window' },
  { page: 'Vitals', section: 'Nightly', element: 'Estimated HRV', sourcePaths: ['derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'RMSSD proxy from successive HR deltas', fallback: 'Not enough nighttime HR', notes: 'proxy' },
  { page: 'Vitals', section: 'Nightly', element: 'SpO2 Night Avg', sourcePaths: ['dailySpo2.spo2_percentage.average'], transform: 'parseSpo2Average', fallback: 'Not in export', notes: 'Percent' },
  { page: 'Vitals', section: 'Nightly', element: 'Temp deviation', sourcePaths: ['dailyReadiness.temperature_deviation'], transform: 'toNumber', fallback: 'Not in export', notes: '°C' }
];
