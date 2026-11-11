import { DataPoint, DescriptiveStats, ModelMetrics, SeriesFrequency } from '../types/timeseries';

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

export function variance(arr: number[], sample = true): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    sq += d * d;
  }
  return sq / (sample ? arr.length - 1 : arr.length);
}

export function stdDev(arr: number[], sample = true): number {
  return Math.sqrt(Math.max(0, variance(arr, sample)));
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function logReturns(prices: number[]): number[] {
  const res: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = Math.max(1e-8, prices[i - 1]);
    const curr = Math.max(1e-8, prices[i]);
    res.push(Math.log(curr / prev));
  }
  return res;
}

export function differenceSeries(arr: number[], d = 1): number[] {
  let curr = [...arr];
  for (let step = 0; step < d; step++) {
    const next: number[] = [];
    for (let i = 1; i < curr.length; i++) {
      next.push(curr[i] - curr[i - 1]);
    }
    curr = next;
  }
  return curr;
}

// Solve linear system A * x = b using Gaussian elimination with partial pivoting + tiny ridge fallback
export function solveLinearSystem(A: number[][], b: number[], ridge = 1e-8): number[] {
  const n = b.length;
  if (n === 0) return [];
  const M = A.map((row, i) => {
    const r = [...row];
    r[i] += ridge;
    return [...r, b[i]];
  });

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > maxVal) {
        maxVal = Math.abs(M[r][col]);
        maxRow = r;
      }
    }
    if (maxRow !== col) {
      const tmp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = tmp;
    }
    const pivot = Math.abs(M[col][col]) < 1e-12 ? (M[col][col] >= 0 ? 1e-12 : -1e-12) : M[col][col];
    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / pivot;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) {
      sum -= M[i][j] * x[j];
    }
    const diag = Math.abs(M[i][i]) < 1e-12 ? 1e-12 : M[i][i];
    x[i] = sum / diag;
  }
  return x;
}

export function olsRegression(X: number[][], y: number[], ridge = 1e-6): {
  coeffs: number[];
  fitted: number[];
  residuals: number[];
  seCoeffs: number[];
} {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  if (n === 0 || k === 0) {
    return { coeffs: [], fitted: [], residuals: [], seCoeffs: [] };
  }

  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      Xty[j] += X[i][j] * y[i];
      for (let m = j; m < k; m++) {
        XtX[j][m] += X[i][j] * X[i][m];
      }
    }
  }
  for (let j = 0; j < k; j++) {
    for (let m = 0; m < j; m++) {
      XtX[j][m] = XtX[m][j];
    }
  }

  const coeffs = solveLinearSystem(XtX, Xty, ridge);
  const fitted: number[] = [];
  const residuals: number[] = [];
  let rss = 0;
  for (let i = 0; i < n; i++) {
    let pred = 0;
    for (let j = 0; j < k; j++) pred += X[i][j] * coeffs[j];
    fitted.push(pred);
    const r = y[i] - pred;
    residuals.push(r);
    rss += r * r;
  }

  const sigma2 = rss / Math.max(1, n - k);
  const seCoeffs: number[] = new Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    const e = new Array(k).fill(0);
    e[j] = 1;
    const invCol = solveLinearSystem(XtX, e, ridge);
    seCoeffs[j] = Math.sqrt(Math.max(1e-12, sigma2 * Math.abs(invCol[j])));
  }

  return { coeffs, fitted, residuals, seCoeffs };
}

export function computeAcf(series: number[], maxLag: number): number[] {
  const n = series.length;
  const m = mean(series);
  let denom = 0;
  for (let i = 0; i < n; i++) denom += Math.pow(series[i] - m, 2);
  if (denom < 1e-12) return new Array(maxLag + 1).fill(0);

  const acf: number[] = [1];
  for (let lag = 1; lag <= maxLag; lag++) {
    let num = 0;
    for (let t = lag; t < n; t++) {
      num += (series[t] - m) * (series[t - lag] - m);
    }
    acf.push(num / denom);
  }
  return acf;
}

export function computePacf(series: number[], maxLag: number): number[] {
  const acf = computeAcf(series, maxLag);
  const pacf: number[] = [1];
  const phi: number[][] = Array.from({ length: maxLag + 1 }, () => new Array(maxLag + 1).fill(0));

  for (let k = 1; k <= maxLag; k++) {
    let num = acf[k];
    let den = 1;
    for (let j = 1; j < k; j++) {
      num -= phi[k - 1][j] * acf[k - j];
      den -= phi[k - 1][j] * acf[j];
    }
    const val = Math.abs(den) < 1e-10 ? 0 : Math.max(-0.99, Math.min(0.99, num / den));
    phi[k][k] = val;
    for (let j = 1; j < k; j++) {
      phi[k][j] = phi[k - 1][j] - val * phi[k - 1][k - j];
    }
    pacf.push(val);
  }
  return pacf;
}

// Augmented Dickey-Fuller test with intercept & lag selection
export function adfTest(series: number[]): { statistic: number; pValue: number; isStationary: boolean } {
  const n = series.length;
  if (n < 15) return { statistic: -1.5, pValue: 0.5, isStationary: false };

  const diff = differenceSeries(series, 1);
  const lags = Math.max(1, Math.min(4, Math.floor(Math.cbrt(n - 1))));

  const X: number[][] = [];
  const y: number[] = [];

  for (let t = lags; t < diff.length; t++) {
    const row = [1, series[t]]; // intercept + y_{t-1}
    for (let l = 1; l <= lags; l++) {
      row.push(diff[t - l]);
    }
    X.push(row);
    y.push(diff[t]);
  }

  const { coeffs, seCoeffs } = olsRegression(X, y, 1e-8);
  const gamma = coeffs[1] ?? 0;
  const seGamma = seCoeffs[1] || 1e-6;
  const tStat = gamma / seGamma;

  // MacKinnon approximate p-value thresholds for constant, no trend (-3.43 = 1%, -2.86 = 5%, -2.57 = 10%)
  let pValue = 0.5;
  if (tStat <= -3.9) pValue = 0.002;
  else if (tStat <= -3.43) pValue = 0.01;
  else if (tStat <= -2.86) pValue = 0.05;
  else if (tStat <= -2.57) pValue = 0.1;
  else if (tStat <= -1.94) pValue = 0.31;
  else if (tStat <= -1.2) pValue = 0.65;
  else pValue = 0.92;

  return {
    statistic: tStat,
    pValue,
    isStationary: tStat < -2.86,
  };
}

// Chi-squared upper tail p-value approximation (Wilson-Hilferty)
export function chiSquarePValue(stat: number, df: number): number {
  if (df <= 0 || stat <= 0) return 1;
  const z = (Math.pow(stat / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCdf(z);
}

export function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function computeMetrics(
  actual: number[],
  predicted: number[],
  prevActual?: number[],
  numParams?: number
): ModelMetrics {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) {
    return { rmse: 0.05, mae: 0.04, mape: 0.5, directionalAccuracy: 50, theilU: 1, rSquared: 0 };
  }

  let sqErr = 0;
  let absErr = 0;
  let pctErr = 0;
  let dirMatches = 0;
  let dirTotal = 0;
  let sumActualSq = 0;
  let sumPredSq = 0;

  const actMean = mean(actual.slice(0, n));
  let tss = 0;

  for (let i = 0; i < n; i++) {
    const a = actual[i];
    const p = predicted[i];
    const err = a - p;
    sqErr += err * err;
    absErr += Math.abs(err);
    pctErr += Math.abs(err) / Math.max(1e-8, Math.abs(a));
    tss += Math.pow(a - actMean, 2);
    sumActualSq += a * a;
    sumPredSq += p * p;

    const base = prevActual ? prevActual[i] : i > 0 ? actual[i - 1] : undefined;
    if (base !== undefined) {
      const actualMove = a - base;
      const predMove = p - base;
      if ((actualMove >= 0 && predMove >= 0) || (actualMove < 0 && predMove < 0)) {
        dirMatches++;
      }
      dirTotal++;
    }
  }

  const rmse = Math.sqrt(sqErr / n);
  const mae = absErr / n;
  const mape = (pctErr / n) * 100;
  const directionalAccuracy = dirTotal > 0 ? (dirMatches / dirTotal) * 100 : 50;
  const denomTheil = Math.sqrt(sumActualSq / n) + Math.sqrt(sumPredSq / n);
  const theilU = denomTheil > 1e-10 ? rmse / denomTheil : 1;
  const rSquared = tss > 1e-10 ? Math.max(-1, 1 - sqErr / tss) : 0;

  let aic: number | undefined;
  let bic: number | undefined;
  if (numParams !== undefined) {
    const mse = Math.max(1e-12, sqErr / n);
    const ll = -0.5 * n * (Math.log(2 * Math.PI) + Math.log(mse) + 1);
    aic = 2 * numParams - 2 * ll;
    bic = numParams * Math.log(n) - 2 * ll;
  }

  return {
    rmse,
    mae,
    mape,
    directionalAccuracy,
    theilU,
    rSquared,
    aic,
    bic,
  };
}

export function computeDescriptiveStats(series: DataPoint[], frequency: SeriesFrequency): DescriptiveStats {
  const prices = series.map((d) => d.close);
  const rets = logReturns(prices);
  const n = prices.length;
  const annFactor = frequency === 'monthly' ? 12 : 252;

  const m = mean(prices);
  const sd = stdDev(prices, true);
  const rMean = mean(rets);
  const rSd = stdDev(rets, true);

  let m3 = 0;
  let m4 = 0;
  const rVar = Math.max(1e-12, rSd * rSd);
  for (let i = 0; i < rets.length; i++) {
    const d = rets[i] - rMean;
    m3 += Math.pow(d, 3);
    m4 += Math.pow(d, 4);
  }
  const rn = Math.max(1, rets.length);
  const skewness = (m3 / rn) / Math.pow(rVar, 1.5);
  const excessKurtosis = (m4 / rn) / Math.pow(rVar, 2) - 3;
  const jb = (rn / 6) * (skewness * skewness + (excessKurtosis * excessKurtosis) / 4);
  const jbP = chiSquarePValue(jb, 2);

  const adfLevel = adfTest(prices);
  const adfDiff1 = adfTest(differenceSeries(prices, 1));

  // Max drawdown
  let peak = prices[0] || 1;
  let maxDd = 0;
  for (let i = 0; i < n; i++) {
    if (prices[i] > peak) peak = prices[i];
    const dd = (peak - prices[i]) / peak;
    if (dd > maxDd) maxDd = dd;
  }

  const totalReturnPct = n > 1 ? ((prices[n - 1] - prices[0]) / prices[0]) * 100 : 0;
  const annualizedReturnPct = rMean * annFactor * 100;
  const annualizedVolPct = rSd * Math.sqrt(annFactor) * 100;
  const sharpeApprox = annualizedVolPct > 0.01 ? annualizedReturnPct / annualizedVolPct : 0;

  return {
    count: n,
    startDate: series[0]?.date ?? '',
    endDate: series[n - 1]?.date ?? '',
    min: Math.min(...prices),
    max: Math.max(...prices),
    mean: m,
    stdDev: sd,
    median: median(prices),
    skewness,
    excessKurtosis,
    jarqueBeraStat: jb,
    jarqueBeraPValue: jbP,
    adfStatistic: adfLevel.statistic,
    adfPValue: adfLevel.pValue,
    isStationaryLevel: adfLevel.isStationary,
    isStationaryDiff1: adfDiff1.isStationary,
    totalReturnPct,
    annualizedReturnPct,
    annualizedVolPct,
    sharpeApprox,
    maxDrawdownPct: maxDd * 100,
  };
}
