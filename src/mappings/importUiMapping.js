export const importUiMapping = [
  {
    page: 'Import',
    section: 'Top nav import',
    element: 'Global file picker',
    sourcePaths: ['#globalImportInput', 'importZip(file, settings, onProgress)'],
    transform: 'zip parse + normalize + derive + persist',
    fallback: 'Import page link',
    notes: 'Mobile-safe off-screen input'
  },
  {
    page: 'Import',
    section: 'Fallback input',
    element: 'Visible fallback file input',
    sourcePaths: ['#fallbackImportInput', 'importZip(file, settings, onProgress)'],
    transform: 'progress callback updates status text',
    fallback: 'Import modal',
    notes: 'Always visible on import page'
  },
  {
    page: 'Import',
    section: 'Status',
    element: 'Import status line',
    sourcePaths: ['importState.phase', 'importState.percent'],
    transform: 'phase + percent text',
    fallback: 'Idle',
    notes: 'Never silent on failure'
  },
  {
    page: 'Import',
    section: 'Success',
    element: 'Data loaded banner',
    sourcePaths: ['ingestReport.dateRange.start', 'ingestReport.dateRange.end', 'ingestReport.dateRange.days'],
    transform: 'template string',
    fallback: 'n/a range',
    notes: 'Shown before reload'
  }
];

