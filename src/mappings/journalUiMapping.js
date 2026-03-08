export const journalUiMapping = [
  {
    page: 'Journal',
    section: 'Entry form',
    element: 'Entry date',
    sourcePaths: ['selectedDate', 'journalForm.date'],
    transform: 'default to selected dashboard date',
    fallback: 'Today',
    notes: 'Editable before save'
  },
  {
    page: 'Journal',
    section: 'Entry form',
    element: 'Tag',
    sourcePaths: ['journalForm.tag'],
    transform: 'trim string',
    fallback: 'none',
    notes: 'Optional'
  },
  {
    page: 'Journal',
    section: 'Entry form',
    element: 'Note',
    sourcePaths: ['journalForm.note'],
    transform: 'trim string',
    fallback: 'none',
    notes: 'Optional'
  },
  {
    page: 'Journal',
    section: 'Entries',
    element: 'Saved journal rows',
    sourcePaths: ['localStorage.ouraJournalEntriesV1'],
    transform: 'JSON parse + reverse chronological render',
    fallback: 'No journal entries yet',
    notes: 'Stored locally in browser'
  }
];

