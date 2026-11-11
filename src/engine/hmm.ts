import { DataPoint, ForecastPoint, HmmResult, SeriesFrequency } from '../types/timeseries';
import { generateFutureDates } from '../utils/dataParser';
import { computeMetrics, logReturns, mean, stdDev } from './mathUtils';

function gaussianPdf(x: number, mu: number, sigma: number): number {
  const s = Math.max(1e-6, sigma);
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
}

interface HmmParams {
  K: number;
  pi: number[];
  A: number[][];
  means: number[];
  vols: number[];
  gamma: number[][]; // T x K posterior state probabilities
  states: number[];
}

function fitGaussianHmm(rets: number[], K = 3, maxIter = 45): HmmParams {
  const T = rets.length;
  const rMean = mean(rets);
  const rStd = Math.max(1e-4, stdDev(rets, false));

  // Initialize ordered regimes: Bear/High-Vol, Consolidation/Neutral, Bull/Low-Vol
  const sorted = [...rets].sort((a, b) => a - b);
  let means = [
    sorted[Math.floor(T * 0.18)] ?? rMean - rStd,
    sorted[Math.floor(T * 0.5)] ?? rMean,
    sorted[Math.floor(T * 0.82)] ?? rMean + rStd,
  ];
  let vols = [rStd * 1.45, rStd * 0.85, rStd * 0.95];

  let pi = [1 / K, 1 / K, 1 / K];
  let A = [
    [0.82, 0.13, 0.05],
    [0.10, 0.80, 0.10],
    [0.05, 0.13, 0.82],
  ];

  let gamma: number[][] = Array.from({ length: T }, () => new Array(K).fill(1 / K));

  for (let iter = 0; iter < maxIter; iter++) {
    // Emission likelihoods B[t][k]
    const B: number[][] = Array.from({ length: T }, (_, t) =>
      Array.from({ length: K }, (__, k) => Math.max(1e-18, gaussianPdf(rets[t], means[k], vols[k])))
    );

    // Forward pass with scaling
    const alpha: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
    const scales = new Array(T).fill(1);

    let sum0 = 0;
    for (let k = 0; k < K; k++) {
      alpha[0][k] = pi[k] * B[0][k];
      sum0 += alpha[0][k];
    }
    scales[0] = Math.max(1e-20, sum0);
    for (let k = 0; k < K; k++) alpha[0][k] /= scales[0];

    for (let t = 1; t < T; t++) {
      let st = 0;
      for (let j = 0; j < K; j++) {
        let acc = 0;
        for (let i = 0; i < K; i++) acc += alpha[t - 1][i] * A[i][j];
        alpha[t][j] = acc * B[t][j];
        st += alpha[t][j];
      }
      scales[t] = Math.max(1e-20, st);
      for (let j = 0; j < K; j++) alpha[t][j] /= scales[t];
    }

    // Backward pass with scaling
    const beta: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
    for (let k = 0; k < K; k++) beta[T - 1][k] = 1;

    for (let t = T - 2; t >= 0; t--) {
      for (let i = 0; i < K; i++) {
        let acc = 0;
        for (let j = 0; j < K; j++) {
          acc += A[i][j] * B[t + 1][j] * beta[t + 1][j];
        }
        beta[t][i] = acc / scales[t + 1];
      }
    }

    // E-step: gamma & xi
    gamma = Array.from({ length: T }, (_, t) => {
      const row = new Array(K).fill(0);
      let s = 0;
      for (let k = 0; k < K; k++) {
        row[k] = alpha[t][k] * beta[t][k];
        s += row[k];
      }
      const denom = Math.max(1e-20, s);
      return row.map((v) => v / denom);
    });

    const xiSum: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
    const gammaSum = new Array(K).fill(0);

    for (let t = 0; t < T - 1; t++) {
      let norm = 0;
      const tmp: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
      for (let i = 0; i < K; i++) {
        gammaSum[i] += gamma[t][i];
        for (let j = 0; j < K; j++) {
          tmp[i][j] = alpha[t][i] * A[i][j] * B[t + 1][j] * beta[t + 1][j];
          norm += tmp[i][j];
        }
      }
      const d = Math.max(1e-20, norm);
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          xiSum[i][j] += tmp[i][j] / d;
        }
      }
    }

    // M-step
    pi = [...gamma[0]];
    for (let i = 0; i < K; i++) {
      const denom = Math.max(1e-8, gammaSum[i]);
      let rowSum = 0;
      for (let j = 0; j < K; j++) {
        A[i][j] = Math.max(0.005, xiSum[i][j] / denom);
        rowSum += A[i][j];
      }
      for (let j = 0; j < K; j++) A[i][j] /= rowSum;
    }

    const newMeans = new Array(K).fill(0);
    const newVols = new Array(K).fill(0);
    for (let k = 0; k < K; k++) {
      let wSum = 0;
      let mAcc = 0;
      for (let t = 0; t < T; t++) {
        wSum += gamma[t][k];
        mAcc += gamma[t][k] * rets[t];
      }
      const wDen = Math.max(1e-6, wSum);
      newMeans[k] = mAcc / wDen;
      let vAcc = 0;
      for (let t = 0; t < T; t++) {
        vAcc += gamma[t][k] * Math.pow(rets[t] - newMeans[k], 2);
      }
      newVols[k] = Math.max(rStd * 0.25, Math.sqrt(vAcc / wDen));
    }
    means = newMeans;
    vols = newVols;
  }

  // Sort states by mean return ascending: 0 = Bear/Stress, 1 = Consolidation, 2 = Bull/Expansion
  const order = [0, 1, 2].sort((a, b) => means[a] - means[b]);
  const sortedMeans = order.map((k) => means[k]);
  const sortedVols = order.map((k) => vols[k]);
  const sortedPi = order.map((k) => pi[k]);
  const sortedA = order.map((i) => order.map((j) => A[i][j]));
  const sortedGamma = gamma.map((row) => order.map((k) => row[k]));
  const states = sortedGamma.map((row) => {
    let bestK = 0;
    for (let k = 1; k < K; k++) if (row[k] > row[bestK]) bestK = k;
    return bestK;
  });

  return {
    K,
    pi: sortedPi,
    A: sortedA,
    means: sortedMeans,
    vols: sortedVols,
    gamma: sortedGamma,
    states,
  };
}

export function runHmmModel(
  series: DataPoint[],
  frequency: SeriesFrequency,
  horizonSteps: number,
  holdoutSize: number
): HmmResult {
  const t0 = performance.now();
  const prices = series.map((s) => s.close);
  const n = prices.length;
  const rets = logReturns(prices);
  const trainEnd = Math.max(20, n - holdoutSize);
  const trainRets = rets.slice(0, trainEnd - 1);

  const trainHmm = fitGaussianHmm(trainRets, 3, 40);

  // Rolling 1-step holdout using Markov transition from current filtered belief
  const holdoutActual: number[] = [];
  const holdoutPredicted: number[] = [];
  const holdoutPrev: number[] = [];

  let belief = [...trainHmm.gamma[trainHmm.gamma.length - 1]];
  for (let idx = trainEnd; idx < n; idx++) {
    // Propagate belief one step: p_next = belief * A
    const nextBelief = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        nextBelief[j] += belief[i] * trainHmm.A[i][j];
      }
    }
    let expRet = 0;
    for (let j = 0; j < 3; j++) expRet += nextBelief[j] * trainHmm.means[j];

    const predPrice = prices[idx - 1] * Math.exp(expRet);
    holdoutActual.push(prices[idx]);
    holdoutPredicted.push(predPrice);
    holdoutPrev.push(prices[idx - 1]);

    // Bayesian update with observed return
    const obsRet = rets[idx - 1];
    const unnorm = nextBelief.map((p, k) => p * Math.max(1e-18, gaussianPdf(obsRet, trainHmm.means[k], trainHmm.vols[k])));
    const sumU = Math.max(1e-18, unnorm.reduce((a, b) => a + b, 0));
    belief = unnorm.map((u) => u / sumU);
  }

  // Full sample HMM fit
  const fullHmm = fitGaussianHmm(rets, 3, 50);

  const fitted = [...prices];
  const residuals = new Array(n).fill(0);
  const historicalStates = new Array(n).fill(1);
  historicalStates[0] = fullHmm.states[0] ?? 1;

  for (let t = 1; t < n; t++) {
    const prevGamma = t === 1 ? fullHmm.pi : fullHmm.gamma[t - 2];
    let expRet = 0;
    for (let j = 0; j < 3; j++) {
      let probJ = 0;
      for (let i = 0; i < 3; i++) probJ += prevGamma[i] * fullHmm.A[i][j];
      expRet += probJ * fullHmm.means[j];
    }
    const predPrice = prices[t - 1] * Math.exp(expRet);
    fitted[t] = predPrice;
    residuals[t] = prices[t] - predPrice;
    historicalStates[t] = fullHmm.states[t - 1] ?? 1;
  }

  // Multi-step Markov state probability propagation
  const futureDates = generateFutureDates(series[n - 1].date, frequency, horizonSteps);
  const forecast: ForecastPoint[] = [];
  const forecastRegimeProbs: number[][] = [];

  let currProb = [...fullHmm.gamma[fullHmm.gamma.length - 1]];
  let priceCursor = prices[n - 1];
  let cumVar = 0;

  for (let h = 0; h < horizonSteps; h++) {
    const nextProb = [0, 0, 0];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        nextProb[j] += currProb[i] * fullHmm.A[i][j];
      }
    }
    currProb = nextProb;
    forecastRegimeProbs.push([...currProb]);

    let expRet = 0;
    let stepVar = 0;
    for (let k = 0; k < 3; k++) {
      expRet += currProb[k] * fullHmm.means[k];
    }
    for (let k = 0; k < 3; k++) {
      stepVar += currProb[k] * (fullHmm.vols[k] * fullHmm.vols[k] + Math.pow(fullHmm.means[k] - expRet, 2));
    }

    priceCursor = Math.max(1e-4, priceCursor * Math.exp(expRet));
    cumVar += stepVar;
    const lower95 = Math.max(1e-4, priceCursor * Math.exp(-1.96 * Math.sqrt(cumVar)));
    const upper95 = priceCursor * Math.exp(1.96 * Math.sqrt(cumVar));

    forecast.push({
      step: h + 1,
      date: futureDates[h],
      point: priceCursor,
      lower95,
      upper95,
    });
  }

  const metrics = computeMetrics(holdoutActual, holdoutPredicted, holdoutPrev, 11);
  const stateLabels = ['Bear / Defensive Regime', 'Consolidation / Neutral Regime', 'Bull / Expansion Regime'];
  const currentStateProbabilities = [...fullHmm.gamma[fullHmm.gamma.length - 1]];
  let currentDominantState = 0;
  for (let k = 1; k < 3; k++) {
    if (currentStateProbabilities[k] > currentStateProbabilities[currentDominantState]) {
      currentDominantState = k;
    }
  }

  const endForecast = forecast[forecast.length - 1]?.point ?? prices[n - 1];
  const chgPct = ((endForecast - prices[n - 1]) / prices[n - 1]) * 100;

  return {
    id: 'hmm',
    name: 'Hidden Markov Model (3-State Gaussian)',
    shortName: 'HMM (3-State)',
    category: 'Regime-Switching',
    equationSummary: `P(S_t = j | S_{t-1} = i) = a_{ij},  r_t | S_t=k ~ N(μ_k, σ_k²)  [Baum-Welch EM]`,
    fitted,
    residuals,
    holdoutActual,
    holdoutPredicted,
    metrics,
    forecast,
    computationMs: performance.now() - t0,
    numStates: 3,
    stateLabels,
    stateMeansPct: fullHmm.means.map((m) => m * 100),
    stateVolsPct: fullHmm.vols.map((v) => v * 100),
    transitionMatrix: fullHmm.A,
    currentStateProbabilities,
    currentDominantState,
    historicalStates,
    forecastRegimeProbs,
    interpretation: `Baum-Welch EM identified 3 latent regimes. Current terminal posterior places ${(currentStateProbabilities[currentDominantState] * 100).toFixed(1)}% probability on "${stateLabels[currentDominantState]}" (μ=${(fullHmm.means[currentDominantState] * 100).toFixed(2)}%, σ=${(fullHmm.vols[currentDominantState] * 100).toFixed(2)}%/bar). Markov chain propagation projects ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% over horizon.`,
  };
}
