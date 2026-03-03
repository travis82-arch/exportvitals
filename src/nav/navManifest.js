export const navManifest = {
  primary: [
    { key: 'by-date', label: 'By Date', route: '/by-date' },
    { key: 'readiness', label: 'Readiness', route: '/readiness' },
    { key: 'sleep', label: 'Sleep', route: '/sleep' },
    { key: 'activity', label: 'Activity', route: '/activity' },
    { key: 'vitals', label: 'Vitals', route: '/vitals' },
    { key: 'my-health', label: 'My Health', route: '/my-health' }
  ],
  myHealth: [
    { key: 'trends', label: 'Trends', route: '/my-health/trends' },
    { key: 'journal', label: 'Journal', route: '/my-health/journal' },
    { key: 'data-tools', label: 'Data Tools', route: '/my-health/data-tools/import' },
    { key: 'settings', label: 'Settings', route: '/my-health/settings' }
  ],
  dataTools: [
    { key: 'import', label: 'Import', route: '/my-health/data-tools/import' },
    { key: 'export', label: 'Export', route: '/my-health/data-tools/export' },
    { key: 'glossary', label: 'Glossary', route: '/my-health/data-tools/glossary' },
    { key: 'debug', label: 'Debug', route: '/my-health/data-tools/debug', debugOnly: true }
  ]
};
