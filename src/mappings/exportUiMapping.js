export const exportUiMapping = [
  {
    page: 'Export',
    section: 'CSV export',
    element: 'derived_nightly_vitals.csv',
    sourcePaths: ['datasets.derivedNightlyVitals'],
    transform: 'toCsv',
    fallback: 'empty CSV',
    notes: 'Downloaded via blob URL'
  },
  {
    page: 'Export',
    section: 'JSON export',
    element: 'normalized_all.json',
    sourcePaths: ['datasets', 'derivedNightlyVitals', 'uiSnapshot', 'ingestReport'],
    transform: 'JSON.stringify',
    fallback: '{}',
    notes: 'Includes metadata + selectedDate'
  }
];

