import { DataPoint, ForecastPoint, KalmanResult, SeriesFrequency } from '../types/timeseries';
import { generateFutureDates } from '../utils/dataParser';
import { computeMetrics, stdDev, variance } from './mathUtils';

interface KalmanFilterPass {
  logLikelihood: number;
  filteredLevel: number[];
  filteredSlope: number[];
  predictedLevel: number[];
  kalmanGain: number[];
  smoothedLevel: number[];
  smoothedSlope: number[];
  finalCov: [[number, number], [number, number]];
}

// Local Linear Trend State-Space Model:
// y_t = mu_t + eps_t, eps_t ~ N(0, H)
// mu_t = mu_{t-1} + beta_{t-1} + eta_t, eta_t ~ N(0, qLevel)
// beta_t = beta_{t-1} + zeta_t, zeta_t ~ N(0, qSlope)
function runKalmanPass(y: number[], H: number, qLevel: number, qSlope: number): KalmanFilterPass {
  const n = y.length;
  const filteredLevel = new Array(n).fill(y[0]);
  const filteredSlope = new Array(n).fill(0);
  const predictedLevel = new Array(n).fill(y[0]);
  const kalmanGain = new Array(n).fill(0);

  // Store predicted & filtered states/covariances for RTS smoother
  const xPred: [number, number][] = [];
  const xFilt: [number, number][] = [];
  const PPred: [[number, number], [number, number]][] = [];
  const PFilt: [[number, number], [number, number]][] = [];

  let mu = y[0];
  let beta = n > 1 ? y[1] - y[0] : 0;
  let P00 = H * 2;
  let P01 = 0;
  let P10 = 0;
  let P11 = H * 0.5;

  let logLikelihood = 0;

  for (let t = 0; t < n; t++) {
    // Predict step: x_{t|t-1} = F * x_{t-1|t-1}, F = [[1, 1], [0, 1]]
    const predMu = t === 0 ? mu : mu + beta;
    const predBeta = beta;

    const p00 = P00 + P01 + P10 + P11 + qLevel;
    const p01 = P01 + P11;
    const p10 = P10 + P11;
    const p11 = P11 + qSlope;

    xPred.push([predMu, predBeta]);
    PPred.push([
      [p00, p01],
      [p10, p11],
    ]);
    predictedLevel[t] = predMu;

    // Innovation
    const v = y[t] - predMu;
    const S = Math.max(1e-10, p00 + H);
    if (t > 1) {
      logLikelihood += -0.5 * (Math.log(2 * Math.PI * S) + (v * v) / S);
    }

    // Kalman Gain K = P_{t|t-1} * C' / S, C = [1, 0]
    const k0 = p00 / S;
    const k1 = p10 / S;
    kalmanGain[t] = k0;

    // Update step
    mu = predMu + k0 * v;
    beta = predBeta + k1 * v;

    P00 = Math.max(1e-10, (1 - k0) * p00);
    P01 = (1 - k0) * p01;
    P10 = p10 - k1 * p00;
    P11 = Math.max(1e-10, p11 - k1 * p01);

    filteredLevel[t] = mu;
    filteredSlope[t] = beta;
    xFilt.push([mu, beta]);
    PFilt.push([
      [P00, P01],
      [P10, P11],
    ]);
  }

  // Rauch-Tung-Striebel (RTS) Backward Smoother
  const smoothedLevel = new Array(n).fill(0);
  const smoothedSlope = new Array(n).fill(0);
  smoothedLevel[n - 1] = xFilt[n - 1][0];
  smoothedSlope[n - 1] = xFilt[n - 1][1];

  let s0 = xFilt[n - 1][0];
  let s1 = xFilt[n - 1][1];

  for (let t = n - 2; t >= 0; t--) {
    const Pp = PPred[t + 1];
    const det = Pp[0][0] * Pp[1][1] - Pp[0][1] * Pp[1][0];
    if (Math.abs(det) < 1e-14) {
      s0 = xFilt[t][0];
      s1 = xFilt[t][1];
    } else {
      // inv(P_{t+1|t})
      const inv00 = Pp[1][1] / det;
      const inv01 = -Pp[0][1] / det;
      const inv10 = -Pp[1][0] / det;
      const inv11 = Pp[0][0] / det;

      // C_t = P_{t|t} * F' * inv(P_{t+1|t})
      const Pf = PFilt[t];
      // Pf * F' where F' = [[1,0],[1,1]]
      const a00 = Pf[0][0] + Pf[0][1];
      const a01 = Pf[0][1];
      const a10 = Pf[1][0] + Pf[1][1];
      const a11 = Pf[1][1];

      const c00 = a00 * inv00 + a01 * inv10;
      const c01 = a00 * inv01 + a01 * inv11;
      const c10 = a10 * inv00 + a11 * inv10;
      const c11 = a10 * inv01 + a11 * inv11;

      const d0 = s0 - xPred[t + 1][0];
      const d1 = s1 - xPred[t + 1][1];

      s0 = xFilt[t][0] + c00 * d0 + c01 * d1;
      s1 = xFilt[t][1] + c10 * d0 + c11 * d1;
    }
    smoothedLevel[t] = s0;
    smoothedSlope[t] = s1;
  }

  return {
    logLikelihood,
    filteredLevel,
    filteredSlope,
    predictedLevel,
    kalmanGain,
    smoothedLevel,
    smoothedSlope,
    finalCov: [
      [P00, P01],
      [P10, P11],
    ],
  };
}

function optimizeKalmanParams(y: number[]): { H: number; qLevel: number; qSlope: number } {
  const diffs: number[] = [];
  for (let i = 1; i < y.length; i++) diffs.push(y[i] - y[i - 1]);
  const baseVar = Math.max(1e-6, variance(diffs, true));

  let bestLL = -Infinity;
  let best = { H: baseVar * 0.4, qLevel: baseVar * 0.4, qSlope: baseVar * 0.02 };

  const hMults = [0.1, 0.3, 0.6, 1.0];
  const qlMults = [0.15, 0.4, 0.8, 1.2];
  const qsMults = [0.005, 0.02, 0.06, 0.15];

  for (const hm of hMults) {
    for (const qlm of qlMults) {
      for (const qsm of qsMults) {
        const H = baseVar * hm;
        const ql = baseVar * qlm;
        const qs = baseVar * qsm;
        const pass = runKalmanPass(y, H, ql, qs);
        if (pass.logLikelihood > bestLL) {
          bestLL = pass.logLikelihood;
          best = { H, qLevel: ql, qSlope: qs };
        }
      }
    }
  }
  return best;
}

export function runKalmanModel(
  series: DataPoint[],
  frequency: SeriesFrequency,
  horizonSteps: number,
  holdoutSize: number
): KalmanResult {
  const t0 = performance.now();
  const prices = series.map((s) => s.close);
  const n = prices.length;
  const trainEnd = Math.max(20, n - holdoutSize);
  const trainPrices = prices.slice(0, trainEnd);

  const optTrain = optimizeKalmanParams(trainPrices);

  // Rolling 1-step Kalman prediction on holdout using estimated noise covariances
  const fullHoldoutPass = runKalmanPass(prices, optTrain.H, optTrain.qLevel, optTrain.qSlope);
  const holdoutActual = prices.slice(trainEnd);
  const holdoutPredicted = fullHoldoutPass.predictedLevel.slice(trainEnd);
  const holdoutPrev = prices.slice(trainEnd - 1, n - 1);

  // Full sample optimization & pass
  const optFull = optimizeKalmanParams(prices);
  const finalPass = runKalmanPass(prices, optFull.H, optFull.qLevel, optFull.qSlope);

  const fitted = finalPass.predictedLevel;
  const residuals = prices.map((p, i) => p - fitted[i]);

  // Multi-step analytical Kalman state-space forecast
  const futureDates = generateFutureDates(series[n - 1].date, frequency, horizonSteps);
  const forecast: ForecastPoint[] = [];
  let mu = finalPass.filteredLevel[n - 1];
  const beta = finalPass.filteredSlope[n - 1];

  let p00 = finalPass.finalCov[0][0];
  let p01 = finalPass.finalCov[0][1];
  let p10 = finalPass.finalCov[1][0];
  let p11 = finalPass.finalCov[1][1];

  for (let h = 0; h < horizonSteps; h++) {
    mu = mu + beta;
    const nextP00 = p00 + p01 + p10 + p11 + optFull.qLevel;
    const nextP01 = p01 + p11;
    const nextP10 = p10 + p11;
    const nextP11 = p11 + optFull.qSlope;

    p00 = nextP00;
    p01 = nextP01;
    p10 = nextP10;
    p11 = nextP11;

    const forecastVar = Math.max(1e-8, p00 + optFull.H);
    const se = Math.sqrt(forecastVar);
    const pt = Math.max(1e-4, mu);

    forecast.push({
      step: h + 1,
      date: futureDates[h],
      point: pt,
      lower95: Math.max(1e-4, pt - 1.96 * se),
      upper95: pt + 1.96 * se,
    });
  }

  const metrics = computeMetrics(holdoutActual, holdoutPredicted, holdoutPrev, 3);
  const snr = (optFull.qLevel + optFull.qSlope) / Math.max(1e-10, optFull.H);
  const steadyGain = finalPass.kalmanGain[n - 1] ?? 0.5;
  const slopePct = (beta / Math.max(1e-6, prices[n - 1])) * 100;
  const endForecast = forecast[forecast.length - 1]?.point ?? prices[n - 1];
  const chgPct = ((endForecast - prices[n - 1]) / prices[n - 1]) * 100;
  const innovStd = stdDev(residuals.slice(2), true);

  return {
    id: 'kalman',
    name: 'Kalman Filter (Local Linear Trend)',
    shortName: 'Kalman Filter',
    category: 'State-Space',
    equationSummary: `y_t = μ_t + ε_t (H=${optFull.H.toFixed(3)}) | μ_t = μ_{t-1} + β_{t-1} + η_t (Q_μ=${optFull.qLevel.toFixed(3)}) | β_t = β_{t-1} + ζ_t`,
    fitted,
    residuals,
    holdoutActual,
    holdoutPredicted,
    metrics,
    forecast,
    computationMs: performance.now() - t0,
    observationVarH: optFull.H,
    levelNoiseVarQ: optFull.qLevel,
    slopeNoiseVarQ: optFull.qSlope,
    signalToNoiseRatio: snr,
    smoothedLevel: finalPass.smoothedLevel,
    smoothedSlope: finalPass.smoothedSlope,
    kalmanGainHistory: finalPass.kalmanGain,
    finalLevel: finalPass.filteredLevel[n - 1],
    finalSlope: beta,
    interpretation: `MLE state-space estimation yielded steady-state Kalman gain K=${steadyGain.toFixed(3)} and signal-to-noise ratio ${snr.toFixed(2)} (innovation σ=${innovStd.toFixed(2)}). Extracted latent drift β=${beta >= 0 ? '+' : ''}${beta.toFixed(3)} per period (${slopePct >= 0 ? '+' : ''}${slopePct.toFixed(2)}%/bar), projecting ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% over horizon.`,
  };
}
