export const DELIMITER_CANDIDATES = [';', ',', '\t', '|'];

export function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[\s_\-]+/g, '');
}

export function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

export function splitOutsideQuotes(line, delimiter) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

export function sniffDelimiter(text) {
  const sample = stripBom(text).slice(0, 8192);
  const lines = sample.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 5);
  if (!lines.length) return { delimiter: ',', headerFieldsCount: 0, headerSample: '', candidates: [] };
  const header = lines[0];
  const scored = DELIMITER_CANDIDATES.map((delimiter) => {
    const counts = lines.map((line) => splitOutsideQuotes(line, delimiter).length);
    const headerFieldsCount = counts[0];
    const avg = counts.reduce((a, n) => a + n, 0) / counts.length;
    const variance = counts.reduce((a, n) => a + ((n - avg) ** 2), 0) / counts.length;
    return { delimiter, headerFieldsCount, variance };
  }).sort((a, b) => {
    if (b.headerFieldsCount !== a.headerFieldsCount) return b.headerFieldsCount - a.headerFieldsCount;
    return a.variance - b.variance;
  });
  const semicolon = scored.find((it) => it.delimiter === ';');
  const comma = scored.find((it) => it.delimiter === ',');
  const sensible = (n) => n >= 3;
  const semicolonPreferred = semicolon && sensible(semicolon.headerFieldsCount)
    && (!comma || !sensible(comma.headerFieldsCount) || semicolon.headerFieldsCount >= comma.headerFieldsCount);
  const winner = semicolonPreferred ? semicolon : scored[0];
  return { delimiter: winner?.delimiter || ',', headerFieldsCount: winner?.headerFieldsCount || 0, headerSample: header, candidates: scored };
}

export function safeJsonParse(raw) {
  if (raw && typeof raw === 'object') return { parsed: raw, error: null, raw: JSON.stringify(raw) };
  if (typeof raw !== 'string' || !raw.trim()) return { parsed: null, error: null, raw: raw ?? null };
  const trimmed = raw.trim();
  if (!['{', '['].includes(trimmed[0])) return { parsed: null, error: null, raw };
  try {
    return { parsed: JSON.parse(trimmed), error: null, raw };
  } catch (error) {
    return { parsed: null, error: String(error.message || error), raw };
  }
}

export function parseContributors(raw) {
  const parsed = safeJsonParse(raw).parsed;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

export function parseSpo2Average(rawJson, fallback) {
  const parsed = safeJsonParse(rawJson).parsed;
  return toNumber(parsed?.average) ?? toNumber(fallback);
}

export function summarizeMet(raw) {
  const parsed = safeJsonParse(raw).parsed;
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const summary = { lt_1_5: 0, b1_5_3: 0, b3_6: 0, gt_6: 0 };
  for (const n of items.map((v) => toNumber(v)).filter((v) => v != null)) {
    if (n < 1.5) summary.lt_1_5 += 1;
    else if (n < 3) summary.b1_5_3 += 1;
    else if (n <= 6) summary.b3_6 += 1;
    else summary.gt_6 += 1;
  }
  return summary;
}

export function toNumber(value) {
  if (value == null) return null;
  const n = Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export function baselineMedian(rows, key, latestDate, window = 14) {
  const vals = rows.filter((r) => r.date !== latestDate && r[key] != null).slice(-window).map((r) => r[key]);
  return vals.length ? median(vals) : null;
}

export function readJournalEntries(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveJournalEntries(storage, key, entries) {
  storage.setItem(key, JSON.stringify(entries));
}

export function toCsv(rows) {
  if (!rows?.length) return '';
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return `${headers.join(',')}\n${rows.map((r) => headers.map((h) => esc(r[h])).join(',')).join('\n')}`;
}
