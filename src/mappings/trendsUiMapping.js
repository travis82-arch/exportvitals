export const trendsUiMapping = [
  { page: 'Trends', section: 'Range', element: 'Date window', sourcePaths: ['selectedDate', 'rangeDays'], transform: 'end date minus days + 1', fallback: '7 days', notes: '7/14/30/90' },
  { page: 'Trends', section: 'Series', element: 'Readiness/Sleep/Activity', sourcePaths: ['dailyReadiness.score', 'dailySleep.score', 'dailyActivity.score'], transform: 'date keyed arrays', fallback: 'No rows', notes: 'Line chart' },
  { page: 'Trends', section: 'Series', element: 'Vitals', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm', 'derivedNightlyVitals.hrv_rmssd_proxy_ms', 'dailySpo2.spo2Average', 'dailyReadiness.temperature_deviation'], transform: 'date keyed arrays', fallback: 'No rows', notes: 'Line chart' }
];
