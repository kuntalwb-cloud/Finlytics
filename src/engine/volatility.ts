import {
  DataPoint,
  GarchFamilyParams,
  NewsImpactPoint,
  SeriesFrequency,
  VolatilityAnalysisResult,
  VolatilityForecastPoint,
  VolatilityPoint,
} from '../types/timeseries';
import { generateFutureDates } from '../utils/dataParser';
import { logReturns, mean, olsRegression, variance } from './mathUtils';

interface Ar2MeanFit {
  phi0: number;
  phi1: number;
  phi2: number;
  residuals: number[];
}

function fitAr2Mean(rets: number[]): Ar2MeanFit {
  if (rets.length < 10) {
    const m = mean(rets);
    return { phi0: m, phi1: 0, phi2: 0, residuals: rets.map((r) => r - m) };
  }
  const X: number[][] = [];
  const y: number[] = [];
  for (let t = 2; t < rets.length; t++) {
    X.push([1, rets[t - 1], rets[t - 2]]);
    y.push(rets[t]);
  }
  const ols = olsRegression(X, y, 1e-6);
  const phi0 = ols.coeffs[0] ?? 0;
  const phi1 = Math.max(-0.85, Math.min(0.85, ols.coeffs[1] ?? 0));
  const phi2 = Math.max(-0.85, Math.min(0.85, ols.coeffs[2] ?? 0));

  const residuals: number[] = [];
  for (let t = 0; t < rets.length; t++) {
    if (t < 2) {
      residuals.push(rets[t] - phi0);
    } else {
      residuals.push(rets[t] - (phi0 + phi1 * rets[t - 1] + phi2 * rets[t - 2]));
    }
  }
  return { phi0, phi1, phi2, residuals };
}

function evalGarch11(eps: number[], omega: number, alpha1: number, beta1: number): { ll: number; sigma2: number[] } {
  const T = eps.length;
  const uncondVar = Math.max(1e-8, variance(eps, true));
  const sigma2 = new Array(T).fill(uncondVar);
  let ll = 0;

  for (let t = 1; t < T; t++) {
    const h = Math.max(1e-10, omega + alpha1 * eps[t - 1] * eps[t - 1] + beta1 * sigma2[t - 1]);
    sigma2[t] = h;
    ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(h) + (eps[t] * eps[t]) / h);
  }
  return { ll, sigma2 };
}

function fitAr2Garch11(rets: number[], annFactor: number): {
  params: GarchFamilyParams;
  sigma2: number[];
  ar: Ar2MeanFit;
} {
  const ar = fitAr2Mean(rets);
  const eps = ar.residuals;
  const T = eps.length;
  const uncondVar = Math.max(1e-8, variance(eps, true));

  let best = { omega: uncondVar * 0.06, alpha1: 0.1, beta1: 0.84, ll: -Infinity, sigma2: new Array(T).fill(uncondVar) };

  const alphas = [0.04, 0.07, 0.11, 0.16, 0.22];
  const betas = [0.65, 0.74, 0.81, 0.87, 0.91];

  for (const a of alphas) {
    for (const b of betas) {
      if (a + b >= 0.985) continue;
      const w = Math.max(1e-9, uncondVar * (1 - a - b));
      const res = evalGarch11(eps, w, a, b);
      if (res.ll > best.ll) {
        best = { omega: w, alpha1: a, beta1: b, ll: res.ll, sigma2: res.sigma2 };
      }
    }
  }

  // Coordinate ascent refinement around best grid point
  let stepA = 0.015;
  let stepB = 0.015;
  for (let round = 0; round < 3; round++) {
    for (const da of [-stepA, 0, stepA]) {
      for (const db of [-stepB, 0, stepB]) {
        const a = Math.max(0.01, best.alpha1 + da);
        const b = Math.max(0.1, best.beta1 + db);
        if (a + b >= 0.988) continue;
        for (const wm of [0.8, 1.0, 1.25]) {
          const w = Math.max(1e-9, uncondVar * (1 - a - b) * wm);
          const res = evalGarch11(eps, w, a, b);
          if (res.ll > best.ll) {
            best = { omega: w, alpha1: a, beta1: b, ll: res.ll, sigma2: res.sigma2 };
          }
        }
      }
    }
    stepA *= 0.5;
    stepB *= 0.5;
  }

  const persistence = best.alpha1 + best.beta1;
  const halfLife = persistence > 0 && persistence < 1 ? Math.log(0.5) / Math.log(persistence) : null;
  const longRunVar = best.omega / Math.max(1e-4, 1 - persistence);
  const uncondVolAnnPct = Math.sqrt(longRunVar * annFactor) * 100;

  const k = 6; // phi0, phi1, phi2, omega, alpha1, beta1
  const aic = 2 * k - 2 * best.ll;
  const bic = k * Math.log(Math.max(2, T - 1)) - 2 * best.ll;

  const terminalVol = Math.sqrt(best.sigma2[T - 1]);
  const lastMean = ar.phi0 + ar.phi1 * (rets[T - 1] ?? 0) + ar.phi2 * (rets[T - 2] ?? 0);
  const var95 = Math.max(0, -(lastMean - 1.6449 * terminalVol)) * 100;
  const var99 = Math.max(0, -(lastMean - 2.3263 * terminalVol)) * 100;
  // Normal Expected Shortfall (CVaR 95%) = phi(z_0.95)/0.05 * sigma - mu
  const cvar95 = Math.max(0, -(lastMean - 2.0627 * terminalVol)) * 100;

  return {
    params: {
      modelName: 'AR(2)-GARCH(1,1)',
      arPhi0: ar.phi0,
      arPhi1: ar.phi1,
      arPhi2: ar.phi2,
      omega: best.omega,
      alpha1: best.alpha1,
      beta1: best.beta1,
      persistence,
      halfLifePeriods: halfLife,
      unconditionalVolAnnPct: uncondVolAnnPct,
      logLikelihood: best.ll,
      aic,
      bic,
      var95Pct: var95,
      var99Pct: var99,
      cvar95Pct: cvar95,
    },
    sigma2: best.sigma2,
    ar,
  };
}

const SQRT_2_OVER_PI = Math.sqrt(2 / Math.PI);

function evalEgarch11(
  eps: number[],
  omega: number,
  alpha1: number,
  gamma1: number,
  beta1: number
): { ll: number; sigma2: number[] } {
  const T = eps.length;
  const uncondVar = Math.max(1e-8, variance(eps, true));
  const sigma2 = new Array(T).fill(uncondVar);
  let logH = Math.log(uncondVar);
  let ll = 0;

  for (let t = 1; t < T; t++) {
    const prevStd = Math.sqrt(Math.max(1e-10, sigma2[t - 1]));
    const z = Math.max(-5, Math.min(5, eps[t - 1] / prevStd));
    logH = omega + beta1 * logH + alpha1 * (Math.abs(z) - SQRT_2_OVER_PI) + gamma1 * z;
    logH = Math.max(-18, Math.min(-0.5, logH));
    const h = Math.exp(logH);
    sigma2[t] = h;
    ll += -0.5 * (Math.log(2 * Math.PI) + logH + (eps[t] * eps[t]) / h);
  }
  return { ll, sigma2 };
}

function fitAr2Egarch11(rets: number[], annFactor: number, ar: Ar2MeanFit): {
  params: GarchFamilyParams;
  sigma2: number[];
} {
  const eps = ar.residuals;
  const T = eps.length;
  const uncondVar = Math.max(1e-8, variance(eps, true));
  const logUncondVar = Math.log(uncondVar);

  let best = {
    omega: logUncondVar * 0.12,
    alpha1: 0.14,
    gamma1: -0.06,
    beta1: 0.88,
    ll: -Infinity,
    sigma2: new Array(T).fill(uncondVar),
  };

  const alphas = [0.06, 0.12, 0.20, 0.28];
  const gammas = [-0.16, -0.09, -0.04, 0.0, 0.05];
  const betas = [0.75, 0.84, 0.90, 0.94];

  for (const b of betas) {
    const w = logUncondVar * (1 - b);
    for (const a of alphas) {
      for (const g of gammas) {
        const res = evalEgarch11(eps, w, a, g, b);
        if (res.ll > best.ll) {
          best = { omega: w, alpha1: a, gamma1: g, beta1: b, ll: res.ll, sigma2: res.sigma2 };
        }
      }
    }
  }

  // Local refinement
  let step = 0.025;
  for (let round = 0; round < 3; round++) {
    for (const da of [-step, 0, step]) {
      for (const dg of [-step, 0, step]) {
        for (const db of [-step * 0.6, 0, step * 0.6]) {
          const a = Math.max(0.01, Math.min(0.45, best.alpha1 + da));
          const g = Math.max(-0.35, Math.min(0.25, best.gamma1 + dg));
          const b = Math.max(0.4, Math.min(0.975, best.beta1 + db));
          const w = logUncondVar * (1 - b);
          const res = evalEgarch11(eps, w, a, g, b);
          if (res.ll > best.ll) {
            best = { omega: w, alpha1: a, gamma1: g, beta1: b, ll: res.ll, sigma2: res.sigma2 };
          }
        }
      }
    }
    step *= 0.5;
  }

  const persistence = best.beta1;
  const halfLife = persistence > 0 && persistence < 1 ? Math.log(0.5) / Math.log(persistence) : null;
  const longRunLogVar = best.omega / Math.max(1e-4, 1 - persistence);
  const longRunVar = Math.exp(Math.max(-18, Math.min(-0.5, longRunLogVar)));
  const uncondVolAnnPct = Math.sqrt(longRunVar * annFactor) * 100;

  const k = 7; // phi0, phi1, phi2, omega, alpha1, gamma1, beta1
  const aic = 2 * k - 2 * best.ll;
  const bic = k * Math.log(Math.max(2, T - 1)) - 2 * best.ll;

  const terminalVol = Math.sqrt(best.sigma2[T - 1]);
  const lastMean = ar.phi0 + ar.phi1 * (rets[T - 1] ?? 0) + ar.phi2 * (rets[T - 2] ?? 0);
  const var95 = Math.max(0, -(lastMean - 1.6449 * terminalVol)) * 100;
  const var99 = Math.max(0, -(lastMean - 2.3263 * terminalVol)) * 100;
  const cvar95 = Math.max(0, -(lastMean - 2.0627 * terminalVol)) * 100;

  return {
    params: {
      modelName: 'AR(2)-EGARCH(1,1)',
      arPhi0: ar.phi0,
      arPhi1: ar.phi1,
      arPhi2: ar.phi2,
      omega: best.omega,
      alpha1: best.alpha1,
      beta1: best.beta1,
      gamma1: best.gamma1,
      persistence,
      halfLifePeriods: halfLife,
      unconditionalVolAnnPct: uncondVolAnnPct,
      logLikelihood: best.ll,
      aic,
      bic,
      var95Pct: var95,
      var99Pct: var99,
      cvar95Pct: cvar95,
    },
    sigma2: best.sigma2,
  };
}

export function runVolatilityAnalysis(
  series: DataPoint[],
  frequency: SeriesFrequency,
  horizonSteps: number
): VolatilityAnalysisResult {
  const prices = series.map((s) => s.close);
  const rets = logReturns(prices);
  const annFactor = frequency === 'monthly' ? 12 : 252;

  const garchFit = fitAr2Garch11(rets, annFactor);
  const egarchFit = fitAr2Egarch11(rets, annFactor, garchFit.ar);

  const historicalVolatility: VolatilityPoint[] = rets.map((r, idx) => ({
    index: idx + 1,
    date: series[idx + 1].date,
    returnPct: r * 100,
    garchVolAnnPct: Math.sqrt(garchFit.sigma2[idx] * annFactor) * 100,
    egarchVolAnnPct: Math.sqrt(egarchFit.sigma2[idx] * annFactor) * 100,
  }));

  // Multi-step volatility forecast
  const futureDates = generateFutureDates(series[series.length - 1].date, frequency, horizonSteps);
  const forecastVolatility: VolatilityForecastPoint[] = [];

  let gVar = garchFit.sigma2[garchFit.sigma2.length - 1];
  const lastEps = garchFit.ar.residuals[garchFit.ar.residuals.length - 1] ?? 0;
  const gA = garchFit.params.alpha1;
  const gB = garchFit.params.beta1;
  const gW = garchFit.params.omega;

  let eVar = egarchFit.sigma2[egarchFit.sigma2.length - 1];
  let eLogVar = Math.log(Math.max(1e-10, eVar));
  const eW = egarchFit.params.omega;
  const eA = egarchFit.params.alpha1;
  const eG = egarchFit.params.gamma1 ?? 0;
  const eB = egarchFit.params.beta1;
  const lastZ = Math.max(-4, Math.min(4, lastEps / Math.sqrt(Math.max(1e-10, eVar))));

  for (let h = 0; h < horizonSteps; h++) {
    if (h === 0) {
      gVar = Math.max(1e-10, gW + gA * lastEps * lastEps + gB * gVar);
      eLogVar = eW + eB * eLogVar + eA * (Math.abs(lastZ) - SQRT_2_OVER_PI) + eG * lastZ;
    } else {
      gVar = Math.max(1e-10, gW + (gA + gB) * gVar);
      // E[|z| - sqrt(2/pi)] = 0 and E[z] = 0 for h >= 2
      eLogVar = eW + eB * eLogVar;
    }
    eLogVar = Math.max(-18, Math.min(-0.5, eLogVar));
    eVar = Math.exp(eLogVar);

    forecastVolatility.push({
      step: h + 1,
      date: futureDates[h],
      garchPeriodVolPct: Math.sqrt(gVar) * 100,
      egarchPeriodVolPct: Math.sqrt(eVar) * 100,
      garchVolAnnPct: Math.sqrt(gVar * annFactor) * 100,
      egarchVolAnnPct: Math.sqrt(eVar * annFactor) * 100,
    });
  }

  // News Impact Curve: shock z from -3 to +3 at unconditional variance
  const baseGVar = garchFit.params.omega / Math.max(1e-4, 1 - garchFit.params.persistence);
  const baseELogVar = egarchFit.params.omega / Math.max(1e-4, 1 - egarchFit.params.beta1);
  const newsImpactCurve: NewsImpactPoint[] = [];
  for (let z = -3.0; z <= 3.01; z += 0.25) {
    const zRound = Number(z.toFixed(2));
    const gResp = gW + gA * (zRound * zRound * baseGVar) + gB * baseGVar;
    const eResp = Math.exp(
      Math.max(-18, Math.min(-0.5, eW + eB * baseELogVar + eA * (Math.abs(zRound) - SQRT_2_OVER_PI) + eG * zRound))
    );
    newsImpactCurve.push({
      shockZ: zRound,
      garchResponseVar: Math.sqrt(gResp * annFactor) * 100,
      egarchResponseVar: Math.sqrt(eResp * annFactor) * 100,
    });
  }

  const preferredVolatilityModel: 'AR(2)-GARCH(1,1)' | 'AR(2)-EGARCH(1,1)' =
    egarchFit.params.aic <= garchFit.params.aic ? 'AR(2)-EGARCH(1,1)' : 'AR(2)-GARCH(1,1)';

  const leverageVal = egarchFit.params.gamma1 ?? 0;
  const leverageEffectDetected = leverageVal < -0.02;
  const leverageCommentary = leverageEffectDetected
    ? `Negative leverage coefficient γ₁ = ${leverageVal.toFixed(3)} confirms asymmetric shock response: negative return shocks amplify conditional variance significantly more than positive shocks of equal magnitude.`
    : `Leverage coefficient γ₁ = ${leverageVal.toFixed(3)} indicates mild or symmetric conditional variance response across positive and negative innovations.`;

  const currentAnnualizedVolPct =
    preferredVolatilityModel === 'AR(2)-EGARCH(1,1)'
      ? historicalVolatility[historicalVolatility.length - 1]?.egarchVolAnnPct ?? 15
      : historicalVolatility[historicalVolatility.length - 1]?.garchVolAnnPct ?? 15;

  const forecastEndAnnualizedVolPct =
    preferredVolatilityModel === 'AR(2)-EGARCH(1,1)'
      ? forecastVolatility[forecastVolatility.length - 1]?.egarchVolAnnPct ?? currentAnnualizedVolPct
      : forecastVolatility[forecastVolatility.length - 1]?.garchVolAnnPct ?? currentAnnualizedVolPct;

  const volDelta = forecastEndAnnualizedVolPct - currentAnnualizedVolPct;
  const volatilityTrend: VolatilityAnalysisResult['volatilityTrend'] =
    volDelta > 1.2 ? 'Expanding' : volDelta < -1.2 ? 'Mean-Reverting / Contracting' : 'Stable';

  const volatilityRegime: VolatilityAnalysisResult['volatilityRegime'] =
    currentAnnualizedVolPct >= 40
      ? 'Stress Regime'
      : currentAnnualizedVolPct >= 26
      ? 'Elevated Volatility'
      : currentAnnualizedVolPct >= 15
      ? 'Moderate Volatility'
      : 'Low Volatility';

  const prefPersist =
    preferredVolatilityModel === 'AR(2)-EGARCH(1,1)'
      ? egarchFit.params.persistence
      : garchFit.params.persistence;

  const trendReliabilityScore: VolatilityAnalysisResult['trendReliabilityScore'] =
    currentAnnualizedVolPct < 24 && prefPersist < 0.96
      ? 'High'
      : currentAnnualizedVolPct < 38
      ? 'Moderate'
      : 'Low';

  const trendAssessmentSummary = `${preferredVolatilityModel} achieves lower AIC (${Math.min(
    garchFit.params.aic,
    egarchFit.params.aic
  ).toFixed(1)} vs ${Math.max(garchFit.params.aic, egarchFit.params.aic).toFixed(1)}). Current annualized volatility sits at ${currentAnnualizedVolPct.toFixed(
    1
  )}% (${volatilityRegime}) and is projected to transition toward ${forecastEndAnnualizedVolPct.toFixed(
    1
  )}% (${volatilityTrend}), yielding ${trendReliabilityScore.toLowerCase()} signal-to-noise reliability for trend continuation.`;

  return {
    garch: garchFit.params,
    egarch: egarchFit.params,
    preferredVolatilityModel,
    leverageEffectDetected,
    leverageCommentary,
    historicalVolatility,
    forecastVolatility,
    newsImpactCurve,
    currentAnnualizedVolPct,
    forecastEndAnnualizedVolPct,
    volatilityTrend,
    volatilityRegime,
    trendReliabilityScore,
    trendAssessmentSummary,
  };
}
