import { ArimaResult, DataPoint, ForecastPoint, SeriesFrequency } from '../types/timeseries';
import { generateFutureDates } from '../utils/dataParser';
import {
  adfTest,
  chiSquarePValue,
  computeAcf,
  computeMetrics,
  computePacf,
  differenceSeries,
  mean,
  olsRegression,
} from './mathUtils';

interface ArmaFit {
  p: number;
  q: number;
  intercept: number;
  ar: number[];
  ma: number[];
  residuals: number[];
  fittedDiff: number[];
  sigma2: number;
  aic: number;
  bic: number;
  ll: number;
}

function fitArmaCss(w: number[], p: number, q: number): ArmaFit {
  const n = w.length;
  const wMean = mean(w);

  if (p === 0 && q === 0) {
    const res = w.map((v) => v - wMean);
    const rss = res.reduce((acc, r) => acc + r * r, 0);
    const sigma2 = Math.max(1e-10, rss / Math.max(1, n));
    const ll = -0.5 * n * (Math.log(2 * Math.PI * sigma2) + 1);
    return {
      p,
      q,
      intercept: wMean,
      ar: [],
      ma: [],
      residuals: res,
      fittedDiff: w.map(() => wMean),
      sigma2,
      aic: 2 * 2 - 2 * ll,
      bic: 2 * Math.log(n) - 2 * ll,
      ll,
    };
  }

  // Hannan-Rissanen Stage 1: fit high-order AR to obtain innovation estimates
  const highArOrder = Math.min(Math.max(p + q + 2, 4), Math.floor(n / 4));
  const X1: number[][] = [];
  const y1: number[] = [];
  for (let t = highArOrder; t < n; t++) {
    const row = [1];
    for (let i = 1; i <= highArOrder; i++) row.push(w[t - i]);
    X1.push(row);
    y1.push(w[t]);
  }
  const stage1 = olsRegression(X1, y1, 1e-5);
  const epsHat = new Array(n).fill(0);
  for (let t = highArOrder; t < n; t++) {
    epsHat[t] = stage1.residuals[t - highArOrder] ?? 0;
  }

  // Stage 2: Regress w_t on intercept, lagged w_{t-i}, and lagged innovations eps_{t-j}
  const start = Math.max(p, q, highArOrder);
  const X2: number[][] = [];
  const y2: number[] = [];
  for (let t = start; t < n; t++) {
    const row = [1];
    for (let i = 1; i <= p; i++) row.push(w[t - i]);
    for (let j = 1; j <= q; j++) row.push(epsHat[t - j]);
    X2.push(row);
    y2.push(w[t]);
  }

  const stage2 = olsRegression(X2, y2, 1e-4);
  const intercept = stage2.coeffs[0] ?? wMean;
  let ar = stage2.coeffs.slice(1, 1 + p);
  let ma = stage2.coeffs.slice(1 + p, 1 + p + q);

  // Enforce stationarity / invertibility shrinkage if needed
  const arSum = ar.reduce((a, b) => a + Math.abs(b), 0);
  if (arSum >= 0.97) {
    const scale = 0.94 / arSum;
    ar = ar.map((c) => c * scale);
  }
  const maSum = ma.reduce((a, b) => a + Math.abs(b), 0);
  if (maSum >= 0.97) {
    const scale = 0.94 / maSum;
    ma = ma.map((c) => c * scale);
  }

  // Conditional Sum of Squares recursive pass to get true ARMA residuals
  const residuals = new Array(n).fill(0);
  const fittedDiff = new Array(n).fill(wMean);
  for (let t = 0; t < n; t++) {
    let pred = intercept;
    for (let i = 1; i <= p; i++) {
      if (t - i >= 0) pred += ar[i - 1] * w[t - i];
      else pred += ar[i - 1] * wMean;
    }
    for (let j = 1; j <= q; j++) {
      if (t - j >= 0) pred += ma[j - 1] * residuals[t - j];
    }
    fittedDiff[t] = pred;
    residuals[t] = w[t] - pred;
  }

  const effRes = residuals.slice(Math.max(p, q));
  const rss = effRes.reduce((acc, r) => acc + r * r, 0);
  const effN = Math.max(1, effRes.length);
  const sigma2 = Math.max(1e-10, rss / effN);
  const kParams = 1 + p + q + 1;
  const ll = -0.5 * effN * (Math.log(2 * Math.PI * sigma2) + 1);
  const aic = 2 * kParams - 2 * ll;
  const bic = kParams * Math.log(effN) - 2 * ll;

  return { p, q, intercept, ar, ma, residuals, fittedDiff, sigma2, aic, bic, ll };
}

function reconstructLevel(prices: number[], fittedDiff: number[], d: number): number[] {
  const n = prices.length;
  const fittedLevel = new Array(n).fill(prices[0]);
  if (d === 0) {
    for (let t = 0; t < n; t++) fittedLevel[t] = fittedDiff[t] ?? prices[t];
  } else if (d === 1) {
    fittedLevel[0] = prices[0];
    for (let t = 1; t < n; t++) {
      fittedLevel[t] = prices[t - 1] + (fittedDiff[t - 1] ?? 0);
    }
  } else {
    fittedLevel[0] = prices[0];
    if (n > 1) fittedLevel[1] = prices[1];
    for (let t = 2; t < n; t++) {
      const prevDiff = prices[t - 1] - prices[t - 2];
      fittedLevel[t] = prices[t - 1] + prevDiff + (fittedDiff[t - 2] ?? 0);
    }
  }
  return fittedLevel;
}

export function runArimaModel(
  series: DataPoint[],
  frequency: SeriesFrequency,
  horizonSteps: number,
  holdoutSize: number
): ArimaResult {
  const t0 = performance.now();
  const prices = series.map((s) => s.close);
  const n = prices.length;
  const trainEnd = Math.max(20, n - holdoutSize);
  const trainPrices = prices.slice(0, trainEnd);

  // Determine differencing order d via ADF test
  let d = 0;
  const adf0 = adfTest(trainPrices);
  if (!adf0.isStationary) {
    d = 1;
    const diff1 = differenceSeries(trainPrices, 1);
    const adf1 = adfTest(diff1);
    if (!adf1.isStationary && trainPrices.length > 40) {
      d = 2;
    }
  }

  const wTrain = differenceSeries(trainPrices, d);

  // Grid search (p, q) minimizing AIC
  let bestFit = fitArmaCss(wTrain, 1, 0);
  const candidates: [number, number][] = [
    [0, 1],
    [1, 0],
    [1, 1],
    [2, 0],
    [0, 2],
    [2, 1],
    [1, 2],
    [2, 2],
    [3, 1],
  ];
  for (const [p, q] of candidates) {
    if (wTrain.length < p + q + 12) continue;
    const fit = fitArmaCss(wTrain, p, q);
    if (Number.isFinite(fit.aic) && fit.aic < bestFit.aic) {
      bestFit = fit;
    }
  }

  // Rolling 1-step holdout predictions using best order
  const holdoutActual: number[] = [];
  const holdoutPredicted: number[] = [];
  const holdoutPrev: number[] = [];

  for (let idx = trainEnd; idx < n; idx++) {
    const subPrices = prices.slice(0, idx);
    const subW = differenceSeries(subPrices, d);
    const subFit = fitArmaCss(subW, bestFit.p, bestFit.q);
    // 1-step diff forecast
    let nextW = subFit.intercept;
    for (let i = 1; i <= subFit.p; i++) {
      nextW += subFit.ar[i - 1] * subW[subW.length - i];
    }
    for (let j = 1; j <= subFit.q; j++) {
      nextW += subFit.ma[j - 1] * subFit.residuals[subFit.residuals.length - j];
    }

    let predLevel = prices[idx - 1];
    if (d === 0) predLevel = nextW;
    else if (d === 1) predLevel = prices[idx - 1] + nextW;
    else predLevel = prices[idx - 1] + (prices[idx - 1] - prices[idx - 2]) + nextW;

    holdoutActual.push(prices[idx]);
    holdoutPredicted.push(Math.max(1e-4, predLevel));
    holdoutPrev.push(prices[idx - 1]);
  }

  // Refit on FULL dataset for final diagnostics & future horizon forecast
  const wFull = differenceSeries(prices, d);
  const fullFit = fitArmaCss(wFull, bestFit.p, bestFit.q);
  const fitted = reconstructLevel(prices, fullFit.fittedDiff, d);
  const levelResiduals = prices.map((p, i) => p - fitted[i]);

  // Multi-step forecast in differenced space -> integrated back to price levels
  const wHistory = [...wFull];
  const epsHistory = [...fullFit.residuals];
  const futureDiffs: number[] = [];

  // Compute psi weights for ARIMA forecast error variance
  const psi: number[] = [1];
  for (let h = 1; h <= horizonSteps; h++) {
    let wPred = fullFit.intercept;
    for (let i = 1; i <= fullFit.p; i++) {
      wPred += fullFit.ar[i - 1] * wHistory[wHistory.length - i];
    }
    for (let j = 1; j <= fullFit.q; j++) {
      const idx = epsHistory.length - j;
      if (idx >= 0) wPred += fullFit.ma[j - 1] * epsHistory[idx];
    }
    wHistory.push(wPred);
    epsHistory.push(0);
    futureDiffs.push(wPred);

    // MA(inf) psi weight for d-integrated process
    let pVal = h <= fullFit.q ? fullFit.ma[h - 1] : 0;
    for (let i = 1; i <= fullFit.p; i++) {
      if (h - i >= 0) pVal += fullFit.ar[i - 1] * psi[h - i];
    }
    psi.push(pVal);
  }

  // Integrate differenced forecasts to level + compute cumulative forecast std error
  const futureDates = generateFutureDates(series[n - 1].date, frequency, horizonSteps);
  const forecast: ForecastPoint[] = [];
  let lastLevel = prices[n - 1];
  let lastDiff = n >= 2 ? prices[n - 1] - prices[n - 2] : 0;
  let cumLevelVar = 0;

  // Integrated psi weights for d >= 1
  const integratedPsi: number[] = [1];
  for (let h = 1; h < horizonSteps; h++) {
    if (d === 0) integratedPsi.push(psi[h]);
    else if (d === 1) integratedPsi.push(integratedPsi[h - 1] + psi[h]);
    else integratedPsi.push(2 * integratedPsi[h - 1] - (h >= 2 ? integratedPsi[h - 2] : 0) + psi[h]);
  }

  for (let h = 0; h < horizonSteps; h++) {
    let nextLevel = futureDiffs[h];
    if (d === 1) {
      nextLevel = lastLevel + futureDiffs[h];
    } else if (d === 2) {
      const nextDiff = lastDiff + futureDiffs[h];
      nextLevel = lastLevel + nextDiff;
      lastDiff = nextDiff;
    }
    lastLevel = Math.max(1e-4, nextLevel);
    cumLevelVar += fullFit.sigma2 * Math.pow(integratedPsi[h], 2);
    const se = Math.sqrt(Math.max(1e-8, cumLevelVar));
    forecast.push({
      step: h + 1,
      date: futureDates[h],
      point: lastLevel,
      lower95: Math.max(1e-4, lastLevel - 1.96 * se),
      upper95: lastLevel + 1.96 * se,
    });
  }

  const metrics = computeMetrics(
    holdoutActual,
    holdoutPredicted,
    holdoutPrev,
    1 + fullFit.p + fullFit.q
  );
  metrics.aic = fullFit.aic;
  metrics.bic = fullFit.bic;

  // Ljung-Box Q test on residuals up to lag 10
  const maxLag = Math.min(12, Math.floor(fullFit.residuals.length / 3));
  const resAcf = computeAcf(fullFit.residuals, maxLag);
  const rn = fullFit.residuals.length;
  let lbQ = 0;
  for (let k = 1; k <= Math.min(10, maxLag); k++) {
    lbQ += (resAcf[k] * resAcf[k]) / Math.max(1, rn - k);
  }
  lbQ *= rn * (rn + 2);
  const lbDf = Math.max(1, Math.min(10, maxLag) - fullFit.p - fullFit.q);
  const lbP = chiSquarePValue(lbQ, lbDf);

  const acf = computeAcf(wFull, maxLag);
  const pacf = computePacf(wFull, maxLag);

  const arTerms = fullFit.ar.map((c, i) => `${c >= 0 ? '+' : ''}${c.toFixed(3)}·y_{t-${i + 1}}`).join(' ');
  const maTerms = fullFit.ma.map((c, i) => `${c >= 0 ? '+' : ''}${c.toFixed(3)}·ε_{t-${i + 1}}`).join(' ');
  const equationSummary = `ARIMA(${fullFit.p},${d},${fullFit.q}): Δ^${d}y_t = ${fullFit.intercept.toFixed(4)} ${arTerms} ${maTerms}`.trim();

  const endForecast = forecast[forecast.length - 1]?.point ?? prices[n - 1];
  const chgPct = ((endForecast - prices[n - 1]) / prices[n - 1]) * 100;

  return {
    id: 'arima',
    name: `ARIMA(${fullFit.p},${d},${fullFit.q})`,
    shortName: `ARIMA(${fullFit.p},${d},${fullFit.q})`,
    category: 'Econometric',
    equationSummary,
    fitted,
    residuals: levelResiduals,
    holdoutActual,
    holdoutPredicted,
    metrics,
    forecast,
    computationMs: performance.now() - t0,
    order: { p: fullFit.p, d, q: fullFit.q },
    arCoeffs: fullFit.ar,
    maCoeffs: fullFit.ma,
    intercept: fullFit.intercept,
    sigma2: fullFit.sigma2,
    logLikelihood: fullFit.ll,
    ljungBoxQ: lbQ,
    ljungBoxP: lbP,
    acf,
    pacf,
    residualAcf: resAcf,
    interpretation: `Selected order (${fullFit.p},${d},${fullFit.q}) via minimum AIC (${fullFit.aic.toFixed(1)}) after ADF stationarity verification (d=${d}). Ljung-Box Q=${lbQ.toFixed(2)} (p=${lbP.toFixed(3)}) indicates ${lbP > 0.05 ? 'white-noise residuals with adequate linear structure capture' : 'residual serial structure requiring nonlinear or GARCH augmentation'}. Projects ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% over ${horizonSteps} periods.`,
  };
}
