export const activityUiMapping = [
  { page: 'Activity', section: 'Score', element: 'Activity score', sourcePaths: ['dailyActivity.score'], transform: 'toNumber', fallback: 'Not in this export', notes: 'Selected day' },
  { page: 'Activity', section: 'Totals', element: 'Steps', sourcePaths: ['dailyActivity.steps'], transform: 'toNumber', fallback: 'Not in this export', notes: 'If present' },
  { page: 'Activity', section: 'Totals', element: 'Active calories', sourcePaths: ['dailyActivity.activeCalories'], transform: 'toNumber', fallback: 'Not in this export', notes: 'If present' },
  { page: 'Activity', section: 'Mini trends', element: '14d average steps/calories', sourcePaths: ['getRange(start,end).dailyActivity'], transform: 'rolling average', fallback: 'Not in this export', notes: 'Simple trend cards' }
];
