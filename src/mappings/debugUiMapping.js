export const debugUiMapping = [
  {
    page: 'Debug',
    section: 'Datasets',
    element: 'Dataset row counts',
    sourcePaths: ['datasets.*.length', 'derivedNightlyVitals.length'],
    transform: 'Object.entries -> counts',
    fallback: '0',
    notes: 'Quick integrity check'
  },
  {
    page: 'Debug',
    section: 'Import',
    element: 'ingestReport',
    sourcePaths: ['ingestReport'],
    transform: 'JSON pretty print',
    fallback: '{}',
    notes: 'Shows parsed files + date range'
  },
  {
    page: 'Debug',
    section: 'Availability',
    element: 'availabilityMatrix',
    sourcePaths: ['availabilityMatrix'],
    transform: 'JSON pretty print',
    fallback: '{}',
    notes: 'Feature-level presence flags'
  },
  {
    page: 'Debug',
    section: 'Runtime diagnostics',
    element: 'overlayProbe + errors + rejections + clicks',
    sourcePaths: ['window.__ouraDiag.overlayProbe', 'window.__ouraDiag.errors', 'window.__ouraDiag.rejections', 'window.__ouraDiag.clicks'],
    transform: 'JSON pretty print',
    fallback: '{}',
    notes: 'Populated by installRuntimeDiagnostics'
  }
];

