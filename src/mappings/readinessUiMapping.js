export const readinessUiMapping = [
  { page: 'Readiness', section: 'Score', element: 'Readiness score', sourcePaths: ['dailyReadiness.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Readiness', section: 'Contributors', element: 'Contributors list', sourcePaths: ['dailyReadiness.contributors'], transform: 'JSON object entries', fallback: 'Not in this export', notes: 'Optional field' },
  { page: 'Readiness', section: 'Temperature', element: 'Temperature deviation', sourcePaths: ['dailyReadiness.temperatureDeviation'], transform: 'toNumber', fallback: 'Not in this export', notes: '°C' },
  { page: 'Readiness', section: 'Baseline compare', element: 'Temperature baseline', sourcePaths: ['getBaseline(temperatureDeviation,windowDays)'], transform: 'median over window', fallback: 'Not in this export', notes: 'Shared selector' }
];
