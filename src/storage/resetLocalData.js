export const RESETTABLE_LOCAL_STORAGE_KEYS = [
  'ouraDerivedMetricsV3',
  'ouraDashboardSettingsV1',
  'ouraInsightsLogV1',
  'ouraDerivedMetricsV4',
  'ouraDashboardSettingsV2',
  'ouraJournalEntriesV1'
];

export function resetLocalData(storage = window.localStorage) {
  for (const key of RESETTABLE_LOCAL_STORAGE_KEYS) {
    storage.removeItem(key);
  }
}
