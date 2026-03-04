export const trendsUiMapping = [
  { page: 'Trends', section: 'Range', element: 'Date window buttons', sourcePaths: ['range=7|14|30|90'], transform: 'end date minus days + 1', fallback: '7 days', notes: 'Shared range selector' },
  { page: 'Trends', section: 'Series', element: 'Readiness/Sleep/Activity scores', sourcePaths: ['getRange(start,end).dailyReadiness.score', 'getRange(start,end).dailySleep.score', 'getRange(start,end).dailyActivity.score'], transform: 'line chart points by date', fallback: 'Not in this export', notes: 'Empty-safe charts' },
  { page: 'Trends', section: 'Series', element: 'RHR + HRV', sourcePaths: ['getRange(start,end).derivedNightlyVitals.rhr_night_bpm', 'getRange(start,end).derivedNightlyVitals.hrv_rmssd_proxy_ms'], transform: 'line chart points by date', fallback: 'Not in this export', notes: 'Derived nightly vitals' },
  { page: 'Trends', section: 'Series', element: 'SpO2 + temperature deviation', sourcePaths: ['getRange(start,end).dailySpo2.spo2Average', 'getRange(start,end).dailyReadiness.temperatureDeviation'], transform: 'line chart points by date', fallback: 'Not in this export', notes: 'Empty-safe charts' }
];
