import { importZip, getAvailableDates, setImportError } from '../store/dataStore.js';
import { resolveSelectedRange, persistSelectedRange } from './selectedRange.js';

export async function runSettingsUploadImport({
  file,
  settings,
  onProgress,
  importZipFn = importZip,
  getAvailableDatesFn = getAvailableDates,
  resolveSelectedRangeFn = resolveSelectedRange,
  persistSelectedRangeFn = persistSelectedRange
}) {
  if (!file) throw new Error('No ZIP file selected.');
  try {
    await importZipFn(file, settings, onProgress);
    const next = resolveSelectedRangeFn(getAvailableDatesFn(), { preset: 'latest-day' });
    persistSelectedRangeFn({ preset: next.preset, start: next.start, end: next.end });
    return next;
  } catch (error) {
    setImportError(error, { source: 'settings-upload' });
    throw error;
  }
}
