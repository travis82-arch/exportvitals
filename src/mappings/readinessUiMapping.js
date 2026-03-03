export const readinessUiMapping = [
  { page: 'Readiness', section: 'Score', element: 'Readiness score', sourcePaths: ['dailyReadiness.score'], transform: 'toNumber', fallback: 'Not in export', notes: 'Selected day' },
  { page: 'Readiness', section: 'Contributors', element: 'Contributors list', sourcePaths: ['dailyReadiness.contributors'], transform: 'JSON object entries', fallback: 'Not in export', notes: 'Optional field' },
  { page: 'Readiness', section: 'Vitals', element: 'Temperature deviation', sourcePaths: ['dailyReadiness.temperature_deviation'], transform: 'toNumber', fallback: 'Not in export', notes: '°C' }
];
