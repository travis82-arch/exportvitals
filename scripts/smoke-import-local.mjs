import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { importZipArrayBuffer } from '../src/store/dataStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const candidateZips = [
  path.join(repoRoot, 'OPS', '_local', 'data3.zip'),
  path.join(repoRoot, 'OPS', '_local', 'data.zip')
];

const options = {
  baselineWindow: 14,
  nightWindowMode: 'auto',
  fallbackStart: '21:00',
  fallbackEnd: '09:00'
};

async function main() {
  const zipPath = await candidateZips.reduce(async (accP, next) => {
    const acc = await accP;
    if (acc) return acc;
    try {
      await fs.access(next);
      return next;
    } catch {
      return null;
    }
  }, Promise.resolve(null));

  if (!zipPath) throw new Error(`Missing local ZIP. Tried: ${candidateZips.join(', ')}`);

  const bytes = await fs.readFile(zipPath);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

  const ingestReport = await importZipArrayBuffer({
    fileName: path.basename(zipPath),
    arrayBuffer,
    options
  });

  const parsedFiles = Array.isArray(ingestReport?.parsedFiles) ? ingestReport.parsedFiles : [];
  const rowCounts = ingestReport?.rowCounts || {};
  const daysPerDataset = ingestReport?.daysPerDataset || {};

  console.log('ingestReport.dateRange:', ingestReport?.dateRange || null);
  console.log('ingestReport.rowCounts:', rowCounts);
  console.log('ingestReport.daysPerDataset:', daysPerDataset);
  console.log('confirm.sleepModelRows>0:', Number(rowCounts.sleepModel || 0) > 0);
  console.log('ingestReport.parsedFiles:', {
    count: parsedFiles.length,
    first10: parsedFiles.slice(0, 10)
  });

  const coreDatasets = ['dailySleep', 'dailyReadiness', 'dailyActivity', 'dailySpo2'];
  const allMissing = coreDatasets.every((name) => !Number(rowCounts[name] || 0));
  if (allMissing) {
    console.error(
      `Smoke import failed: ${coreDatasets.join(', ')} are all missing. Possible dataset alias mismatch.`
    );
    process.exit(1);
  }
  if (!Number(rowCounts.sleepModel || 0)) {
    console.error('Smoke import failed: sleepModel rows are zero.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
