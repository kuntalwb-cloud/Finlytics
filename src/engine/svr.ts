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
  let sq = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
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
      const diag = K[i][i] + 1e-6;
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
          f[j] += delta * K[i][j];
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
  let sum = model.bias;
  for (let k = 0; k < model.supportIndices.length; k++) {
    const i = model.supportIndices[k];
    sum += model.alphaDiff[i] * rbfKernel(model.trainX[i], x, model.gamma);
  }
  return sum;
}

function buildFeatureVector(windowPrices: number[], lookback: number): number[] {
  const len = windowPrices.length;
  const last = windowPrices[len - 1];
  const prev = windowPrices[Math.max(0, len - 2)];
  const rets: number[] = [];
  for (let l = 1; l <= lookback; l++) {
    const p1 = windowPrices[len - l];
    const p0 = windowPrices[Math.max(0, len - l - 1)];
    rets.push(Math.log(Math.max(1e-6, p1) / Math.max(1e-6, p0)));
  }
  const sma5 = mean(windowPrices.slice(-Math.min(5, len)));
  const sma10 = mean(windowPrices.slice(-Math.min(10, len)));
  const momentum5 = (last - sma5) / Math.max(1e-6, sma5);
  const momentum10 = (last - sma10) / Math.max(1e-6, sma10);
  const recentRets: number[] = [];
  for (let i = Math.max(1, len - 10); i < len; i++) {
    recentRets.push(Math.log(Math.max(1e-6, windowPrices[i]) / Math.max(1e-6, windowPrices[i - 1])));
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
  const lookback = frequency === 'monthly' ? 4 : 5;
  const trainEnd = Math.max(lookback + 15, n - holdoutSize);

  const buildSamples = (endIdx: number) => {
    const XRaw: number[][] = [];
    const yRaw: number[] = [];
    const indices: number[] = [];
    for (let t = lookback + 1; t < endIdx; t++) {
      const feat = buildFeatureVector(prices.slice(0, t), lookback);
      const targetRet = Math.log(Math.max(1e-6, prices[t]) / Math.max(1e-6, prices[t - 1]));
      XRaw.push(feat);
      yRaw.push(targetRet);
      indices.push(t);
    }
    return { XRaw, yRaw, indices };
  };

  const { XRaw: trainXRaw, yRaw: trainYRaw } = buildSamples(trainEnd);

  // Standardize features & target based on training statistics
  const numFeat = trainXRaw[0].length;
  const featMeans = new Array(numFeat).fill(0);
  const featStds = new Array(numFeat).fill(1);
  for (let j = 0; j < numFeat; j++) {
    const col = trainXRaw.map((r) => r[j]);
    featMeans[j] = mean(col);
    featStds[j] = Math.max(1e-5, stdDev(col, false));
  }
  const yMean = mean(trainYRaw);
  const yStd = Math.max(1e-5, stdDev(trainYRaw, false));

  const scaleX = (row: number[]) => row.map((v, j) => (v - featMeans[j]) / featStds[j]);
  const trainX = trainXRaw.map(scaleX);
  const trainY = trainYRaw.map((v) => (v - yMean) / yStd);

  // Quick validation split on tail of training data to pick (C, gamma)
  const valSplit = Math.max(5, Math.floor(trainX.length * 0.2));
  const subTrainX = trainX.slice(0, trainX.length - valSplit);
  const subTrainY = trainY.slice(0, trainY.length - valSplit);
  const valX = trainX.slice(trainX.length - valSplit);
  const valY = trainY.slice(trainY.length - valSplit);

  let bestParams = { c: 2.0, eps: 0.1, gamma: 1 / numFeat };
  let bestValMse = Infinity;
  const cGrid = [1.0, 2.5, 5.0];
  const gGrid = [0.5 / numFeat, 1.0 / numFeat, 2.0 / numFeat];

  for (const c of cGrid) {
    for (const g of gGrid) {
      const m = trainSvrDual(subTrainX, subTrainY, c, 0.1, g, 80);
      let mse = 0;
      for (let i = 0; i < valX.length; i++) {
        const pred = predictSvr(m, valX[i]);
        mse += Math.pow(valY[i] - pred, 2);
      }
      mse /= Math.max(1, valX.length);
      if (mse < bestValMse) {
        bestValMse = mse;
        bestParams = { c, eps: 0.1, gamma: g };
      }
    }
  }

  // Fit on training window for holdout evaluation
  const trainModel = trainSvrDual(trainX, trainY, bestParams.c, bestParams.eps, bestParams.gamma, 130);
  const holdoutActual: number[] = [];
  const holdoutPredicted: number[] = [];
  const holdoutPrev: number[] = [];

  for (let idx = trainEnd; idx < n; idx++) {
    const feat = scaleX(buildFeatureVector(prices.slice(0, idx), lookback));
    const predRet = predictSvr(trainModel, feat) * yStd + yMean;
    const clampedRet = Math.max(-0.25, Math.min(0.25, predRet));
    const predPrice = prices[idx - 1] * Math.exp(clampedRet);
    holdoutActual.push(prices[idx]);
    holdoutPredicted.push(predPrice);
    holdoutPrev.push(prices[idx - 1]);
  }

  // Refit on FULL dataset for final fitted curve & horizon forecast
  const { XRaw: fullXRaw, yRaw: fullYRaw, indices: fullIndices } = buildSamples(n);
  const fullFeatMeans = new Array(numFeat).fill(0);
  const fullFeatStds = new Array(numFeat).fill(1);
  for (let j = 0; j < numFeat; j++) {
    const col = fullXRaw.map((r) => r[j]);
    fullFeatMeans[j] = mean(col);
    fullFeatStds[j] = Math.max(1e-5, stdDev(col, false));
  }
  const fullYMean = mean(fullYRaw);
  const fullYStd = Math.max(1e-5, stdDev(fullYRaw, false));
  const scaleFullX = (row: number[]) => row.map((v, j) => (v - fullFeatMeans[j]) / fullFeatStds[j]);

  const fullX = fullXRaw.map(scaleFullX);
  const fullY = fullYRaw.map((v) => (v - fullYMean) / fullYStd);
  const fullModel = trainSvrDual(fullX, fullY, bestParams.c, bestParams.eps, bestParams.gamma, 150);

  const fitted = [...prices];
  const residuals = new Array(n).fill(0);
  for (let k = 0; k < fullIndices.length; k++) {
    const t = fullIndices[k];
    const predRet = predictSvr(fullModel, fullX[k]) * fullYStd + fullYMean;
    const predPrice = prices[t - 1] * Math.exp(Math.max(-0.25, Math.min(0.25, predRet)));
    fitted[t] = predPrice;
    residuals[t] = prices[t] - predPrice;
  }

  const resStd = Math.max(1e-6, stdDev(residuals.slice(lookback + 1), true));

  // Recursive multi-step forecast
  const futureDates = generateFutureDates(series[n - 1].date, frequency, horizonSteps);
  const forecast: ForecastPoint[] = [];
  const priceCursor = [...prices];

  for (let h = 0; h < horizonSteps; h++) {
    const feat = scaleFullX(buildFeatureVector(priceCursor, lookback));
    const predRet = predictSvr(fullModel, feat) * fullYStd + fullYMean;
    const clampedRet = Math.max(-0.18, Math.min(0.18, predRet));
    const nextPrice = Math.max(1e-4, priceCursor[priceCursor.length - 1] * Math.exp(clampedRet));
    priceCursor.push(nextPrice);

    const band = 1.96 * resStd * Math.sqrt(h + 1);
    forecast.push({
      step: h + 1,
      date: futureDates[h],
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
      const perturbed = [...fullX[i]];
      perturbed[j] = 0;
      const p = predictSvr(fullModel, perturbed);
      diffSq += Math.pow(basePreds[i] - p, 2);
    }
    return Math.sqrt(diffSq / Math.max(1, fullX.length));
  });
  const totalImp = Math.max(1e-8, rawImp.reduce((a, b) => a + b, 0));
  const featureImportance = featureNames
    .map((feature, idx) => ({ feature, weight: (rawImp[idx] / totalImp) * 100 }))
    .sort((a, b) => b.weight - a.weight);

  const metrics = computeMetrics(holdoutActual, holdoutPredicted, holdoutPrev);
  const svRatio = (fullModel.supportIndices.length / Math.max(1, fullX.length)) * 100;
  const endForecast = forecast[forecast.length - 1]?.point ?? prices[n - 1];
  const chgPct = ((endForecast - prices[n - 1]) / prices[n - 1]) * 100;

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
