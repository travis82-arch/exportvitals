export const byDateUiMapping = [
  { page: 'By Date', section: 'Summary', element: 'Readiness score', sourcePaths: ['dailyReadiness.score'], transform: 'toNumber', fallback: 'Not in export', notes: 'Selected day' },
  { page: 'By Date', section: 'Summary', element: 'Sleep score', sourcePaths: ['dailySleep.score'], transform: 'toNumber', fallback: 'Not in export', notes: 'Selected day' },
  { page: 'By Date', section: 'Summary', element: 'Activity score', sourcePaths: ['dailyActivity.score'], transform: 'toNumber', fallback: 'Not in export', notes: 'Selected day' },
  { page: 'By Date', section: 'Summary', element: 'RHR Night', sourcePaths: ['derivedNightlyVitals.rhr_night_bpm'], transform: 'derived median', fallback: 'Not enough nighttime HR', notes: 'Derived from heart rate + sleep windows' }
];
