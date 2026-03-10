export const readinessUiMapping = [
  { page: 'Readiness', section: 'Score', element: 'Readiness score', sourcePaths: ['dailyReadiness.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Readiness', section: 'Score', element: 'Readiness label', sourcePaths: ['dailyReadiness.score'], transform: 'scoreBand(score)', fallback: 'Not available yet', notes: 'Optimal/Good/Fair/Pay attention' },
  { page: 'Readiness', section: 'Contributors', element: 'Contributor list', sourcePaths: ['dailyReadiness.contributors.*'], transform: 'scoreBand + rail percentage', fallback: 'Not available yet', notes: 'All listed contributors in priority order' },
  { page: 'Readiness', section: 'Key metrics', element: 'Resting heart rate', sourcePaths: ['sleepModel.lowestHeartRate'], transform: 'toNumber + bpm', fallback: 'Not available in this export', notes: 'sleepmodel source' },
  { page: 'Readiness', section: 'Key metrics', element: 'Average HRV', sourcePaths: ['sleepModel.avgHrv'], transform: 'toNumber + ms', fallback: 'Not available in this export', notes: 'sleepmodel source' },
  { page: 'Readiness', section: 'Key metrics', element: 'Respiratory rate', sourcePaths: ['sleepModel.avgBreath'], transform: 'toNumber + /min', fallback: 'Not available in this export', notes: 'sleepmodel source' },
  { page: 'Readiness', section: 'Details', element: 'Lowest heart rate chart', sourcePaths: ['sleepModel.hrJson -> parseSeriesJson -> seriesToPoints'], transform: 'AxisLineChart + fixed y-domain config', fallback: 'No data in selected range', notes: 'Axes always visible' },
  { page: 'Readiness', section: 'Details', element: 'Average HRV chart', sourcePaths: ['sleepModel.hrvJson -> parseSeriesJson -> seriesToPoints'], transform: 'AxisLineChart + fixed y-domain config', fallback: 'No data in selected range', notes: 'Gaps preserved for nulls' }
];
