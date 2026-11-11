import * as XLSX from 'xlsx';
import { DataPoint, ParsedDataset, SeriesFrequency } from '../types/timeseries';

function excelSerialToIso(serial: number): string {
  // Excel epoch starts 1899-12-30
  const utcDays = Math.floor(serial - 25569);
  const utcMs = utcDays * 86400 * 1000;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return String(serial);
  return d.toISOString().slice(0, 10);
}

export function normalizeDateString(raw: unknown): { iso: string; timestamp: number; isMonthlyFormat: boolean } {
  if (typeof raw === 'number' && raw > 15000 && raw < 80000) {
    const iso = excelSerialToIso(raw);
    return { iso, timestamp: Date.parse(iso), isMonthlyFormat: false };
  }
  const str = String(raw ?? '').trim();
  if (!str) return { iso: '', timestamp: NaN, isMonthlyFormat: false };

  // Handle YYYY-MM or YYYY/MM
  const ymMatch = str.match(/^(\d{4})[-/](\d{1,2})$/);
  if (ymMatch) {
    const y = ymMatch[1];
    const m = ymMatch[2].padStart(2, '0');
    const iso = `${y}-${m}-01`;
    return { iso: `${y}-${m}`, timestamp: Date.parse(iso), isMonthlyFormat: true };
  }

  // Handle DD/MM/YYYY or MM/DD/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const a = parseInt(dmyMatch[1], 10);
    const b = parseInt(dmyMatch[2], 10);
    const y = dmyMatch[3];
    // If first part > 12, definitely DD/MM/YYYY; otherwise assume MM/DD/YYYY
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { iso, timestamp: Date.parse(iso), isMonthlyFormat: false };
  }

  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    const iso = d.toISOString().slice(0, 10);
    return { iso, timestamp: parsed, isMonthlyFormat: false };
  }

  return { iso: str, timestamp: NaN, isMonthlyFormat: false };
}

function parseNumeric(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
  if (val === null || val === undefined) return NaN;
  const cleaned = String(val).replace(/[$,%\s,]/g, '');
  if (!cleaned) return NaN;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : NaN;
}

export function detectColumns(headers: string[], rows: Record<string, string | number | null>[]): {
  dateCol: string;
  priceCol: string;
} {
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const datePriority = ['date', 'timestamp', 'time', 'period', 'month', 'day', 'dt', 'observation_date'];
  let dateCol = headers[0] || '';
  for (const kw of datePriority) {
    const idx = lowerHeaders.findIndex((h) => h === kw || h.includes(kw));
    if (idx !== -1) {
      dateCol = headers[idx];
      break;
    }
  }

  const pricePriority = ['adj close', 'adj_close', 'close', 'price', 'last', 'value', 'index', 'nav', 'rate', 'settle'];
  let priceCol = headers.find((h) => h !== dateCol) || headers[0] || '';
  for (const kw of pricePriority) {
    const idx = lowerHeaders.findIndex((h) => h === kw || h.includes(kw));
    if (idx !== -1 && headers[idx] !== dateCol) {
      priceCol = headers[idx];
      break;
    }
  }

  // Verify priceCol actually has numbers
  const sampleCheck = rows.slice(0, 15).filter((r) => !Number.isNaN(parseNumeric(r[priceCol]))).length;
  if (sampleCheck === 0) {
    for (const h of headers) {
      if (h === dateCol) continue;
      const numCount = rows.slice(0, 15).filter((r) => !Number.isNaN(parseNumeric(r[h]))).length;
      if (numCount > 0) {
        priceCol = h;
        break;
      }
    }
  }

  return { dateCol, priceCol };
}

export function buildSeriesFromRows(
  headers: string[],
  rows: Record<string, string | number | null>[],
  dateCol: string,
  priceCol: string
): { series: DataPoint[]; detectedFrequency: SeriesFrequency } {
  const lowerMap = new Map(headers.map((h) => [h.toLowerCase().trim(), h]));
  const openCol = lowerMap.get('open');
  const highCol = lowerMap.get('high');
  const lowCol = lowerMap.get('low');
  const volCol = lowerMap.get('volume') || lowerMap.get('vol');

  const extracted: {
    rawDate: string;
    iso: string;
    timestamp: number;
    isMonthlyFormat: boolean;
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const close = parseNumeric(row[priceCol]);
    if (Number.isNaN(close) || close <= 0) continue;

    const rawDate = String(row[dateCol] ?? `T+${i + 1}`);
    const norm = normalizeDateString(row[dateCol]);

    extracted.push({
      rawDate,
      iso: norm.iso || `T+${i + 1}`,
      timestamp: norm.timestamp,
      isMonthlyFormat: norm.isMonthlyFormat,
      close,
      open: openCol ? parseNumeric(row[openCol]) : undefined,
      high: highCol ? parseNumeric(row[highCol]) : undefined,
      low: lowCol ? parseNumeric(row[lowCol]) : undefined,
      volume: volCol ? parseNumeric(row[volCol]) : undefined,
    });
  }

  // Sort chronologically if timestamps are valid
  const validTimestamps = extracted.filter((e) => !Number.isNaN(e.timestamp));
  if (validTimestamps.length > extracted.length * 0.8) {
    extracted.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Deduplicate identical dates keeping latest
  const deduped: typeof extracted = [];
  for (const item of extracted) {
    if (deduped.length > 0 && deduped[deduped.length - 1].iso === item.iso) {
      deduped[deduped.length - 1] = item;
    } else {
      deduped.push(item);
    }
  }

  // Detect daily vs monthly frequency using median day delta
  let detectedFrequency: SeriesFrequency = 'daily';
  if (validTimestamps.length >= 4) {
    const deltas: number[] = [];
    for (let i = 1; i < deduped.length; i++) {
      if (!Number.isNaN(deduped[i].timestamp) && !Number.isNaN(deduped[i - 1].timestamp)) {
        const days = (deduped[i].timestamp - deduped[i - 1].timestamp) / (86400 * 1000);
        if (days > 0) deltas.push(days);
      }
    }
    if (deltas.length > 0) {
      deltas.sort((a, b) => a - b);
      const medianDelta = deltas[Math.floor(deltas.length / 2)];
      if (medianDelta >= 20 || deduped.every((d) => d.isMonthlyFormat)) {
        detectedFrequency = 'monthly';
      }
    }
  }

  const series: DataPoint[] = deduped.map((d, idx) => ({
    index: idx,
    date: detectedFrequency === 'monthly' && d.iso.length >= 7 ? d.iso.slice(0, 7) : d.iso,
    rawDate: d.rawDate,
    close: d.close,
    open: Number.isNaN(d.open ?? NaN) ? undefined : d.open,
    high: Number.isNaN(d.high ?? NaN) ? undefined : d.high,
    low: Number.isNaN(d.low ?? NaN) ? undefined : d.low,
    volume: Number.isNaN(d.volume ?? NaN) ? undefined : d.volume,
  }));

  return { series, detectedFrequency };
}

export async function parseFinancialFile(file: File): Promise<ParsedDataset> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('The uploaded workbook contains no readable sheets.');
  }
  const sheet = workbook.Sheets[sheetName];
  const rawJson = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(sheet, {
    defval: null,
    raw: true,
  });

  if (!rawJson || rawJson.length === 0) {
    throw new Error('No tabular rows were found in the uploaded file.');
  }

  const headers = Object.keys(rawJson[0]).filter((h) => !h.startsWith('__EMPTY'));
  if (headers.length < 2) {
    throw new Error('Expected at least two columns (Date/Period and Price/Value).');
  }

  const { dateCol, priceCol } = detectColumns(headers, rawJson);
  const { series, detectedFrequency } = buildSeriesFromRows(headers, rawJson, dateCol, priceCol);

  if (series.length < 25) {
    throw new Error(
      `Only ${series.length} valid observations found. At least 25 time-series observations are required for ARIMA, GARCH, HMM, and ML estimation.`
    );
  }

  return {
    fileName: file.name,
    sheetName,
    headers,
    rows: rawJson,
    detectedDateCol: dateCol,
    detectedPriceCol: priceCol,
    detectedFrequency,
    series,
  };
}

export function generateFutureDates(lastDate: string, frequency: SeriesFrequency, steps: number): string[] {
  const norm = normalizeDateString(lastDate);
  const dates: string[] = [];

  if (Number.isNaN(norm.timestamp)) {
    for (let i = 1; i <= steps; i++) {
      dates.push(`T+${i}`);
    }
    return dates;
  }

  const cursor = new Date(norm.timestamp);
  if (frequency === 'monthly') {
    for (let i = 1; i <= steps; i++) {
      const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + i, 1));
      dates.push(next.toISOString().slice(0, 7));
    }
  } else {
    let added = 0;
    const dayCursor = new Date(cursor.getTime());
    while (added < steps) {
      dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
      const dow = dayCursor.getUTCDay();
      if (dow !== 0 && dow !== 6) {
        dates.push(dayCursor.toISOString().slice(0, 10));
        added++;
      }
    }
  }
  return dates;
}

// Deterministic seeded PRNG for reproducible built-in benchmark datasets
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(rng: () => number): number {
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export type SampleDatasetKey = 'daily_equity' | 'monthly_index' | 'daily_volatile';

export function loadSampleDataset(key: SampleDatasetKey): ParsedDataset {
  const rng = mulberry32(key === 'daily_equity' ? 4201 : key === 'monthly_index' ? 7719 : 9931);
  const rows: Record<string, string | number | null>[] = [];

  if (key === 'monthly_index') {
    // 72 months (6 years) of macro equity index close prices with regime switching + GARCH clustering
    let price = 3120.5;
    let vol = 0.032;
    const startYear = 2020;
    const startMonth = 10; // Nov 2020 -> Oct 2026
    for (let i = 0; i < 72; i++) {
      const d = new Date(Date.UTC(startYear, startMonth + i, 1));
      const dateStr = d.toISOString().slice(0, 7);
      const regimeDrift = i < 20 ? 0.014 : i < 36 ? -0.005 : i < 58 ? 0.011 : 0.008;
      const shock = randn(rng);
      // EGARCH-style asymmetry
      const leverage = shock < 0 ? 1.35 : 0.85;
      vol = Math.sqrt(0.00015 + 0.16 * Math.pow(vol * shock * leverage, 2) + 0.76 * vol * vol);
      const ret = regimeDrift + vol * shock;
      const open = Number(price.toFixed(2));
      price = Math.max(500, price * Math.exp(ret));
      const close = Number(price.toFixed(2));
      const high = Number((Math.max(open, close) * (1 + Math.abs(randn(rng)) * 0.012)).toFixed(2));
      const low = Number((Math.min(open, close) * (1 - Math.abs(randn(rng)) * 0.012)).toFixed(2));
      rows.push({
        Date: dateStr,
        Open: open,
        High: high,
        Low: low,
        Close: close,
        Volume: Math.round(18000000 + rng() * 9000000),
      });
    }
    const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'];
    const { series } = buildSeriesFromRows(headers, rows, 'Date', 'Close');
    return {
      fileName: 'SPX_Monthly_Benchmark_72M.xlsx',
      sheetName: 'Monthly_Close',
      headers,
      rows,
      detectedDateCol: 'Date',
      detectedPriceCol: 'Close',
      detectedFrequency: 'monthly',
      series,
    };
  }

  // Daily datasets (252 trading days ~ 1 year)
  const isVolatile = key === 'daily_volatile';
  let price = isVolatile ? 142.8 : 186.4;
  let vol = isVolatile ? 0.024 : 0.0115;
  const cursor = new Date(Date.UTC(2025, 10, 10));
  let count = 0;

  while (count < 252) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    const dateStr = cursor.toISOString().slice(0, 10);
    // Cyclic bull/pullback/recovery regimes
    const phase =
      count < 70
        ? 0.0011
        : count < 115
        ? -0.0014
        : count < 185
        ? 0.0013
        : 0.0008;

    const shock = randn(rng);
    const asym = shock < 0 ? (isVolatile ? 1.45 : 1.3) : 0.82;
    const baseOmega = isVolatile ? 0.000035 : 0.000009;
    vol = Math.sqrt(baseOmega + 0.11 * Math.pow(vol * shock * asym, 2) + 0.84 * vol * vol);
    const ret = phase + vol * shock;
    const open = Number(price.toFixed(2));
    price = Math.max(10, price * Math.exp(ret));
    const close = Number(price.toFixed(2));
    const spread = Math.max(0.003, vol * 0.65);
    const high = Number((Math.max(open, close) * (1 + Math.abs(randn(rng)) * spread)).toFixed(2));
    const low = Number((Math.min(open, close) * (1 - Math.abs(randn(rng)) * spread)).toFixed(2));
    rows.push({
      Date: dateStr,
      Open: open,
      High: high,
      Low: low,
      Close: close,
      Volume: Math.round((isVolatile ? 48000000 : 24000000) * (0.7 + rng() * 0.8 + (Math.abs(shock) > 1.5 ? 0.6 : 0))),
    });
    count++;
  }

  const headers = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume'];
  const { series } = buildSeriesFromRows(headers, rows, 'Date', 'Close');
  return {
    fileName: isVolatile ? 'NVDA_HighVol_Daily_252D.csv' : 'AAPL_Equity_Daily_252D.csv',
    sheetName: 'Daily_OHLCV',
    headers,
    rows,
    detectedDateCol: 'Date',
    detectedPriceCol: 'Close',
    detectedFrequency: 'daily',
    series,
  };
}
