import JSZip from 'jszip';
import { normalizeName, stripBom, sniffDelimiter } from '../vitals-core.mjs';
import Papa from 'papaparse';

const OURA_DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'],
  dailySleep: ['dailysleep.csv'],
  dailyActivity: ['dailyactivity.csv'],
  dailyStress: ['dailystress.csv'],
  daytimeStress: ['daytimestress.csv'],
  dailySpo2: ['dailyspo2.csv'],
  sleepTime: ['sleeptime.csv'],
  heartRate: ['heartrate.csv'],
  sleepModel: ['sleepmodel.csv'],
  workout: ['workout.csv', 'workouts.csv'],
  session: ['session.csv', 'sessions.csv']
};

export function detectSource(fileName = '', zipEntries = []) {
  const normalizedEntries = zipEntries.map((entryName) => normalizeName(String(entryName).split('/').pop()));
  const knownFiles = Object.values(OURA_DATASET_ALIASES).flat().map(normalizeName);
  const hasKnownDataset = normalizedEntries.some((entry) => knownFiles.includes(entry));
  if (String(fileName).toLowerCase().endsWith('.zip') && (hasKnownDataset || normalizedEntries.length > 0)) return 'oura';
  return 'unknown';
}

function parseCsv(text) {
  const clean = stripBom(text);
  const { delimiter } = sniffDelimiter(clean);
  const { data } = Papa.parse(clean, { header: true, skipEmptyLines: true, delimiter });
  return data || [];
}

export async function parseOuraExport(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entries = Object.keys(zip.files).filter((entryName) => !zip.files[entryName].dir);
  const parsedFiles = [];
  const datasets = {};

  for (const entryName of entries) {
    parsedFiles.push(entryName);
    const short = normalizeName(entryName.split('/').pop());
    for (const [dataset, aliases] of Object.entries(OURA_DATASET_ALIASES)) {
      if (aliases.some((alias) => normalizeName(alias) === short)) {
        const text = await zip.files[entryName].async('string');
        datasets[dataset] = parseCsv(text);
      }
    }
  }

  return { datasets, parsedFiles };
}

export function mapToCanonicalModel(sourceData = {}, normalizeRows) {
  const normalizedDatasets = {};
  for (const [datasetName, rows] of Object.entries(sourceData.datasets || {})) {
    normalizedDatasets[datasetName] = normalizeRows(datasetName, rows);
  }
  return normalizedDatasets;
}

export function deriveSharedMetrics({ source, canonicalData, deriveNightlyVitals, options = {} }) {
  return {
    source,
    capabilities: {
      supportsReadiness: (canonicalData.dailyReadiness || []).length > 0,
      supportsSleep: (canonicalData.dailySleep || []).length > 0,
      supportsActivity: (canonicalData.dailyActivity || []).length > 0,
      supportsSpo2: (canonicalData.dailySpo2 || []).length > 0,
      supportsStress: (canonicalData.dailyStress || []).length > 0,
      planned: ['fitbit']
    },
    canonicalData: {
      ...canonicalData,
      derivedNightlyVitals: deriveNightlyVitals(options)
    }
  };
}

export { OURA_DATASET_ALIASES };
