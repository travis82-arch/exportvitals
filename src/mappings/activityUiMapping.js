export const activityUiMapping = [
  { page: 'Activity', section: 'Score', element: 'Activity score', sourcePaths: ['dailyActivity.score'], transform: 'toNumber', fallback: 'Not in export', notes: 'Selected day' },
  { page: 'Activity', section: 'Totals', element: 'Steps', sourcePaths: ['dailyActivity.steps'], transform: 'toNumber', fallback: 'Not in export', notes: 'If present' },
  { page: 'Activity', section: 'Totals', element: 'Calories', sourcePaths: ['dailyActivity.active_calories'], transform: 'toNumber', fallback: 'Not in export', notes: 'If present' }
];
