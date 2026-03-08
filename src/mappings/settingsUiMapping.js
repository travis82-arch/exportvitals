export const settingsUiMapping = [
  {
    page: 'Settings',
    section: 'Preferences',
    element: 'Baseline window',
    sourcePaths: ['localStorage.ouraDashboardSettingsV2.baselineWindow'],
    transform: 'number input -> saveSettings',
    fallback: '14',
    notes: 'Used by getBaseline'
  },
  {
    page: 'Settings',
    section: 'Preferences',
    element: 'Night window mode',
    sourcePaths: ['localStorage.ouraDashboardSettingsV2.nightWindowMode'],
    transform: 'select input -> saveSettings',
    fallback: 'auto',
    notes: 'Affects heart-rate window selection'
  },
  {
    page: 'Settings',
    section: 'Preferences',
    element: 'Fallback start/end',
    sourcePaths: ['localStorage.ouraDashboardSettingsV2.fallbackStart', 'localStorage.ouraDashboardSettingsV2.fallbackEnd'],
    transform: 'time input -> saveSettings',
    fallback: '21:00 / 09:00',
    notes: 'Used when sleep_time rows missing'
  },
  {
    page: 'Settings',
    section: 'Preferences',
    element: 'Developer mode',
    sourcePaths: ['localStorage.ouraDashboardSettingsV2.developerMode'],
    transform: 'checkbox -> saveSettings',
    fallback: 'false',
    notes: 'Diagnostic-oriented option'
  },
  {
    page: 'Settings',
    section: 'Data',
    element: 'Availability matrix',
    sourcePaths: ['availabilityMatrix'],
    transform: 'JSON pretty print',
    fallback: '{}',
    notes: 'Computed during import'
  },
  {
    page: 'Settings',
    section: 'Data',
    element: 'Clear app cache',
    sourcePaths: ['purgeStaleServiceWorkersAndCaches', 'resetLocalData'],
    transform: 'clear + cache-bust reload',
    fallback: 'none',
    notes: 'Resets stale local browser data'
  }
];

