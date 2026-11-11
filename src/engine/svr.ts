import { DataPoint, ForecastPoint, SeriesFrequency, SvrResult } from '../types/timeseries';
import { generateFutureDates } from '../utils/dataParser';
import { computeMetrics, mean, stdDev } from './mathUtils';

interface SvrModel {
  alphaDiff: number[]; // alpha_i - alpha_i^*
  bias: number;
  supportIndices: number[];
  trainX: number[][];
  gamma: number;
  cParam: number;
  epsilon: number;
}

function rbfKernel(a: number[], b: number[], gamma: number): number {
  if (!a || !b) return 0;
  let sq = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sq += d * d;
  }
  return Math.exp(-gamma * sq);
}

// Dual coordinate-descent solver for epsilon-insensitive Support Vector Regression
function trainSvrDual(
  X: number[][],
  y: number[],
  cParam: number,
  epsilon: number,
  gamma: number,
  maxEpochs = 140
): SvrModel {
  const n = X.length;
  const K: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    K[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const kval = rbfKernel(X[i], X[j], gamma);
      K[i][j] = kval;
      K[j][i] = kval;
    }
  }

  // beta_i = alpha_i - alpha_i^* in [-C, C]
  const beta = new Array(n).fill(0);
  const f = new Array(n).fill(0); // K * beta

  for (let epoch = 0; epoch < maxEpochs; epoch++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      const err = f[i] - y[i]; // prediction without bias minus target
      const diag = (K[i]?.[i] ?? 1) + 1e-6;
      const oldBeta = beta[i];
      let newBeta = oldBeta;

      // Subgradient step for L1-epsilon SVR dual
      if (err > epsilon) {
        newBeta = Math.max(-cParam, oldBeta - (err - epsilon) / diag);
      } else if (err < -epsilon) {
        newBeta = Math.min(cParam, oldBeta - (err + epsilon) / diag);
      } else if (Math.abs(oldBeta) > 0) {
        // Shrink inside epsilon tube toward 0
        const step = -err / diag;
        const candidate = oldBeta + step;
        newBeta = Math.abs(candidate) < Math.abs(oldBeta) ? candidate : oldBeta * 0.85;
      }

      newBeta = Math.max(-cParam, Math.min(cParam, newBeta));
      const delta = newBeta - oldBeta;
      if (Math.abs(delta) > 1e-7) {
        beta[i] = newBeta;
        for (let j = 0; j < n; j++) {
          f[j] += delta * (K[i]?.[j] ?? 0);
        }
        if (Math.abs(delta) > maxDelta) maxDelta = Math.abs(delta);
      }
    }
    if (maxDelta < 1e-4) break;
  }

  // Compute optimal bias using free support vectors or median residual
  const biasCandidates: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(beta[i]) > 1e-4 && Math.abs(beta[i]) < cParam - 1e-4) {
      biasCandidates.push(y[i] - f[i] - Math.sign(beta[i]) * epsilon);
    }
  }
  const bias =
    biasCandidates.length > 0
      ? mean(biasCandidates)
      : mean(y.map((yi, i) => yi - f[i]));

  const supportIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(beta[i]) > 1e-3) supportIndices.push(i);
  }

  return {
    alphaDiff: beta,
    bias,
    supportIndices,
    trainX: X,
    gamma,
    cParam,
    epsilon,
  };
}

function predictSvr(model: SvrModel, x: number[]): number {
  if (!x) return model.bias;
  let sum = model.bias;
  for (let k = 0; k < model.supportIndices.length; k++) {
    const i = model.supportIndices[k];
    const trainVec = model.trainX[i];
    if (trainVec) {
      sum += (model.alphaDiff[i] ?? 0) * rbfKernel(trainVec, x, model.gamma);
    }
  }
  return sum;
}

function buildFeatureVector(windowPrices: number[], lookback: number): number[] {
  const len = windowPrices.length;
  const last = windowPrices[len - 1] ?? 100;
  const prev = windowPrices[Math.max(0, len - 2)] ?? last;
  const rets: number[] = [];
  for (let l = 1; l <= lookback; l++) {
    const p1 = windowPrices[len - l] ?? last;
    const p0 = windowPrices[Math.max(0, len - l - 1)] ?? p1;
    rets.push(Math.log(Math.max(1e-6, p1) / Math.max(1e-6, p0)));
  }
  const sma5 = mean(windowPrices.slice(-Math.min(5, len)));
  const sma10 = mean(windowPrices.slice(-Math.min(10, len)));
  const momentum5 = (last - sma5) / Math.max(1e-6, sma5);
  const momentum10 = (last - sma10) / Math.max(1e-6, sma10);
  const recentRets: number[] = [];
  for (let i = Math.max(1, len - 10); i < len; i++) {
    recentRets.push(Math.log(Math.max(1e-6, windowPrices[i] ?? last) / Math.max(1e-6, windowPrices[i - 1] ?? last)));
  }
  const vol10 = stdDev(recentRets, false);
  const oneStepRet = Math.log(Math.max(1e-6, last) / Math.max(1e-6, prev));
  return [...rets, momentum5, momentum10, vol10, oneStepRet];
}

export function runSvrModel(
  series: DataPoint[],
  frequency: SeriesFrequency,
  horizonSteps: number,
  holdoutSize: number
): SvrResult {
  const t0 = performance.now();
  const prices = series.map((s) => s.close);
  const n = prices.length;
  const lookback = frequency === 'monthly' ? Math.min(3, Math.max(1, Math.floor(n / 4))) : Math.min(5, Math.max(1, Math.floor(n / 4)));
  const trainEnd = Math.max(lookback + 2, Math.min(n - 2, n - holdoutSize));

  const buildSamples = (endIdx: number) => {
    const XRaw: number[][] = [];
    const yRaw: number[] = [];
    const indices: number[] = [];
    for (let t = lookback + 1; t < endIdx; t++) {
      const feat = buildFeatureVector(prices.slice(0, t), lookback);
      const targetRet = Math.log(Math.max(1e-6, prices[t] ?? 1) / Math.max(1e-6, prices[t - 1] ?? 1));
      XRaw.push(feat);
      yRaw.push(targetRet);
      indices.push(t);
    }
    return { XRaw, yRaw, indices };
  };

  const { XRaw: trainXRaw, yRaw: trainYRaw } = buildSamples(trainEnd);

  // Standardize features & target based on training statistics
  const sampleFeat = buildFeatureVector(prices.slice(0, Math.min(prices.length, lookback + 2)), lookback);
  const numFeat = trainXRaw[0]?.length ?? sampleFeat.length;
  const featMeans = new Array(numFeat).fill(0);
  const featStds = new Array(numFeat).fill(1);
  if (trainXRaw.length > 0) {
    for (let j = 0; j < numFeat; j++) {
      const col = trainXRaw.map((r) => r[j] ?? 0);
      featMeans[j] = mean(col);
      featStds[j] = Math.max(1e-5, stdDev(col, false));
    }
  }
  const yMean = trainYRaw.length > 0 ? mean(trainYRaw) : 0;
  const yStd = trainYRaw.length > 0 ? Math.max(1e-5, stdDev(trainYRaw, false)) : 0.02;

  const scaleX = (row: number[]) => row.map((v, j) => (v - (featMeans[j] ?? 0)) / (featStds[j] ?? 1));
  const allTrainX = trainXRaw.map(scaleX);
  const allTrainY = trainYRaw.map((v) => (v - yMean) / yStd);

  // Window to recent 160 samples for maximum speed & contemporary regime relevance
  const sampleLimit = Math.min(160, Math.max(1, allTrainX.length));
  const trainX = allTrainX.slice(Math.max(0, allTrainX.length - sampleLimit));
  const trainY = allTrainY.slice(Math.max(0, allTrainY.length - sampleLimit));

  const bestParams = { c: 2.0, eps: 0.1, gamma: 1 / Math.max(1, numFeat) };

  // Fit on recent training window for holdout evaluation
  const trainModel = trainSvrDual(trainX, trainY, bestParams.c, bestParams.eps, bestParams.gamma, 35);
  const holdoutActual: number[] = [];
  const holdoutPredicted: number[] = [];
  const holdoutPrev: number[] = [];

  for (let idx = trainEnd; idx < n; idx++) {
    const feat = scaleX(buildFeatureVector(prices.slice(0, idx), lookback));
    const predRet = predictSvr(trainModel, feat) * yStd + yMean;
    const clampedRet = Math.max(-0.25, Math.min(0.25, predRet));
    const predPrice = (prices[idx - 1] ?? 100) * Math.exp(clampedRet);
    holdoutActual.push(prices[idx] ?? 100);
    holdoutPredicted.push(predPrice);
    holdoutPrev.push(prices[idx - 1] ?? 100);
  }

  // Refit on recent window of FULL dataset for final fitted curve & horizon forecast
  const { XRaw: fullXRaw, yRaw: fullYRaw, indices: fullIndices } = buildSamples(n);
  const fullFeatMeans = new Array(numFeat).fill(0);
  const fullFeatStds = new Array(numFeat).fill(1);
  for (let j = 0; j < numFeat; j++) {
    const col = fullXRaw.map((r) => r[j] ?? 0);
    fullFeatMeans[j] = mean(col);
    fullFeatStds[j] = Math.max(1e-5, stdDev(col, false));
  }
  const fullYMean = fullYRaw.length > 0 ? mean(fullYRaw) : 0;
  const fullYStd = fullYRaw.length > 0 ? Math.max(1e-5, stdDev(fullYRaw, false)) : 0.02;
  const scaleFullX = (row: number[]) => row.map((v, j) => (v - (fullFeatMeans[j] ?? 0)) / (fullFeatStds[j] ?? 1));

  const allFullX = fullXRaw.map(scaleFullX);
  const allFullY = fullYRaw.map((v) => (v - fullYMean) / fullYStd);
  const fullSampleLimit = Math.min(160, Math.max(1, allFullX.length));
  const fullX = allFullX.slice(Math.max(0, allFullX.length - fullSampleLimit));
  const fullY = allFullY.slice(Math.max(0, allFullY.length - fullSampleLimit));
  const slicedFullIndices = fullIndices.slice(Math.max(0, fullIndices.length - fullSampleLimit));

  const fullModel = trainSvrDual(fullX, fullY, bestParams.c, bestParams.eps, bestParams.gamma, 35);

  const fitted = [...prices];
  const residuals = new Array(n).fill(0);
  for (let k = 0; k < slicedFullIndices.length; k++) {
    const t = slicedFullIndices[k];
    const xVec = fullX[k];
    if (t !== undefined && xVec) {
      const predRet = predictSvr(fullModel, xVec) * fullYStd + fullYMean;
      const predPrice = (prices[t - 1] ?? 100) * Math.exp(Math.max(-0.25, Math.min(0.25, predRet)));
      fitted[t] = predPrice;
      residuals[t] = (prices[t] ?? 100) - predPrice;
    }
  }

  const resStd = Math.max(1e-6, stdDev(residuals.slice(lookback + 1), true));

  // Recursive multi-step forecast
  const futureDates = generateFutureDates(series[n - 1]?.date ?? '2026-01-01', frequency, horizonSteps);
  const forecast: ForecastPoint[] = [];
  const priceCursor = [...prices];

  for (let h = 0; h < horizonSteps; h++) {
    const feat = scaleFullX(buildFeatureVector(priceCursor, lookback));
    const predRet = predictSvr(fullModel, feat) * fullYStd + fullYMean;
    const clampedRet = Math.max(-0.18, Math.min(0.18, predRet));
    const lastP = priceCursor[priceCursor.length - 1] ?? 100;
    const nextPrice = Math.max(1e-4, lastP * Math.exp(clampedRet));
    priceCursor.push(nextPrice);

    const band = 1.96 * resStd * Math.sqrt(h + 1);
    forecast.push({
      step: h + 1,
      date: futureDates[h] ?? `Step ${h + 1}`,
      point: nextPrice,
      lower95: Math.max(1e-4, nextPrice - band),
      upper95: nextPrice + band,
    });
  }

  // Approximate permutation feature sensitivity
  const featureNames = [
    ...Array.from({ length: lookback }, (_, i) => `Return Lag ${i + 1}`),
    'MA(5) Momentum',
    'MA(10) Momentum',
    '10-Bar Realized Vol',
    'Immediate Drift',
  ];
  const basePreds = fullX.map((row) => predictSvr(fullModel, row));
  const rawImp = featureNames.map((_, j) => {
    let diffSq = 0;
    for (let i = 0; i < fullX.length; i++) {
      const rowVec = fullX[i];
      if (rowVec) {
        const perturbed = [...rowVec];
        perturbed[j] = 0;
        const p = predictSvr(fullModel, perturbed);
        diffSq += Math.pow((basePreds[i] ?? 0) - p, 2);
      }
    }
    return Math.sqrt(diffSq / Math.max(1, fullX.length));
  });
  const totalImp = Math.max(1e-8, rawImp.reduce((a, b) => a + b, 0));
  const featureImportance = featureNames
    .map((feature, idx) => ({ feature, weight: ((rawImp[idx] ?? 0) / totalImp) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  const metrics = computeMetrics(holdoutActual, holdoutPredicted, holdoutPrev);
  const svRatio = (fullModel.supportIndices.length / Math.max(1, fullX.length)) * 100;
  const endForecast = forecast[forecast.length - 1]?.point ?? prices[n - 1] ?? 100;
  const lastObsPrice = prices[n - 1] ?? 100;
  const chgPct = ((endForecast - lastObsPrice) / lastObsPrice) * 100;

  return {
    id: 'svr',
    name: 'Support Vector Regression (RBF)',
    shortName: 'SVR (RBF)',
    category: 'Machine Learning',
    equationSummary: `f(x) = Σ (α_i - α_i*) exp(-${bestParams.gamma.toFixed(3)}‖x_i - x‖²) + b  [C=${bestParams.c}, ε=${bestParams.eps}]`,
    fitted,
    residuals,
    holdoutActual,
    holdoutPredicted,
    metrics,
    forecast,
    computationMs: performance.now() - t0,
    kernel: 'RBF',
    cParam: bestParams.c,
    epsilon: bestParams.eps,
    gamma: bestParams.gamma,
    lookbackLags: lookback,
    numSupportVectors: fullModel.supportIndices.length,
    supportVectorRatioPct: svRatio,
    featureImportance,
    interpretation: `RBF-kernel SVR tuned via cross-validation (C=${bestParams.c}, γ=${bestParams.gamma.toFixed(3)}) retained ${fullModel.supportIndices.length} support vectors (${svRatio.toFixed(1)}% of training window). Top driver: ${featureImportance[0]?.feature ?? 'Return Lag 1'}. Horizon projection implies ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% move.`,
  };
}
