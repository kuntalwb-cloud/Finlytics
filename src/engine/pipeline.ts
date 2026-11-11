import {
  BaseModelResult,
  ComparativeSummary,
  DataPoint,
  ForecastPoint,
  FullAnalysisResult,
  ModelId,
  SeriesFrequency,
} from '../types/timeseries';
import { runArimaModel } from './arima';
import { runHmmModel } from './hmm';
import { runKalmanModel } from './kalman';
import { computeDescriptiveStats, computeMetrics, mean, stdDev } from './mathUtils';
import { runRnnGaModel } from './rnnGa';
import { runSvrModel } from './svr';
import { runVolatilityAnalysis } from './volatility';

export function runFullAnalysisPipeline(
  datasetName: string,
  series: DataPoint[],
  frequency: SeriesFrequency,
  holdoutRatio = 0.15
): FullAnalysisResult {
  // Enforce exact domain horizon rules:
  // Daily stock price -> 10 days ahead; Monthly data -> 3 months close ahead
  const horizonSteps = frequency === 'monthly' ? 3 : 10;
  const n = series.length;
  const holdoutSize = Math.max(2, Math.min(Math.floor(n * 0.25), Math.max(2, Math.round(n * holdoutRatio))));

  const stats = computeDescriptiveStats(series, frequency);
  const arima = runArimaModel(series, frequency, horizonSteps, holdoutSize);
  const svr = runSvrModel(series, frequency, horizonSteps, holdoutSize);
  const rnnGa = runRnnGaModel(series, frequency, horizonSteps, holdoutSize);
  const hmm = runHmmModel(series, frequency, horizonSteps, holdoutSize);
  const kalman = runKalmanModel(series, frequency, horizonSteps, holdoutSize);
  const volatility = runVolatilityAnalysis(series, frequency, horizonSteps);

  const models: BaseModelResult[] = [arima, svr, rnnGa, hmm, kalman];

  // Inverse-RMSE weighted Ensemble Consensus
  const invWeights = models.map((m) => 1 / Math.max(1e-6, m.metrics.rmse));
  const sumW = invWeights.reduce((a, b) => a + b, 0);
  const normW = invWeights.map((w) => w / sumW);

  const ensembleHoldoutPred = arima.holdoutActual.map((_, idx) =>
    models.reduce((acc, m, mIdx) => acc + normW[mIdx] * (m.holdoutPredicted[idx] ?? arima.holdoutActual[idx]), 0)
  );
  const trainEnd = n - holdoutSize;
  const holdoutPrev = series.slice(trainEnd - 1, n - 1).map((d) => d.close);

  const ensembleFitted = series.map((pt, idx) =>
    models.reduce((acc, m, mIdx) => acc + normW[mIdx] * (m.fitted[idx] ?? pt.close), 0)
  );
  const ensembleResiduals = series.map((pt, idx) => pt.close - ensembleFitted[idx]);

  const ensembleForecast: ForecastPoint[] = Array.from({ length: horizonSteps }, (_, h) => {
    const pts = models.map((m) => m.forecast[h]);
    const point = pts.reduce((acc, fp, mIdx) => acc + normW[mIdx] * fp.point, 0);
    const modelDispersionStd = stdDev(pts.map((p) => p.point), false);
    const avgBandHalf = pts.reduce((acc, fp, mIdx) => acc + normW[mIdx] * ((fp.upper95 - fp.lower95) / 2), 0);
    const combinedHalf = Math.sqrt(avgBandHalf * avgBandHalf + Math.pow(1.96 * modelDispersionStd, 2));
    return {
      step: h + 1,
      date: pts[0].date,
      point,
      lower95: Math.max(1e-4, point - combinedHalf),
      upper95: point + combinedHalf,
    };
  });

  const ensembleMetrics = computeMetrics(arima.holdoutActual, ensembleHoldoutPred, holdoutPrev);
  const lastPrice = series[n - 1].close;
  const lastDate = series[n - 1].date;
  const ensEnd = ensembleForecast[ensembleForecast.length - 1].point;
  const ensChgPct = ((ensEnd - lastPrice) / lastPrice) * 100;

  const ensemble: BaseModelResult = {
    id: 'ensemble',
    name: 'Inverse-RMSE Weighted Ensemble',
    shortName: 'Ensemble',
    category: 'Consensus',
    equationSummary: models.map((m, i) => `${(normW[i] * 100).toFixed(1)}%·${m.shortName}`).join(' + '),
    fitted: ensembleFitted,
    residuals: ensembleResiduals,
    holdoutActual: arima.holdoutActual,
    holdoutPredicted: ensembleHoldoutPred,
    metrics: ensembleMetrics,
    forecast: ensembleForecast,
    computationMs: models.reduce((a, m) => a + m.computationMs, 0),
    interpretation: `Optimal inverse-RMSE combination assigns highest weight to ${models[normW.indexOf(Math.max(...normW))].shortName} (${(Math.max(...normW) * 100).toFixed(1)}%). Consensus target: ${ensEnd.toFixed(2)} (${ensChgPct >= 0 ? '+' : ''}${ensChgPct.toFixed(2)}%).`,
  };

  // Rank individual models + ensemble by out-of-sample RMSE
  const allForRank = [...models, ensemble];
  const rankedModels = [...allForRank]
    .sort((a, b) => a.metrics.rmse - b.metrics.rmse)
    .map((m, idx) => {
      const endP = m.forecast[m.forecast.length - 1]?.point ?? lastPrice;
      return {
        rank: idx + 1,
        id: m.id,
        name: m.name,
        category: m.category,
        rmse: m.metrics.rmse,
        mae: m.metrics.mae,
        mape: m.metrics.mape,
        directionalAccuracy: m.metrics.directionalAccuracy,
        theilU: m.metrics.theilU,
        rSquared: m.metrics.rSquared,
        horizonEndPrice: endP,
        impliedChangePct: ((endP - lastPrice) / lastPrice) * 100,
      };
    });

  const bestSingle = [...models].sort((a, b) => a.metrics.rmse - b.metrics.rmse)[0];
  const bestDir = [...models].sort((a, b) => b.metrics.directionalAccuracy - a.metrics.directionalAccuracy)[0];

  const singleEnds = models.map((m) => m.forecast[m.forecast.length - 1]?.point ?? lastPrice);
  const modelDispersionPct = (stdDev(singleEnds, false) / Math.max(1e-6, mean(singleEnds))) * 100;

  let marketBias: ComparativeSummary['marketBias'] = 'Neutral / Range-Bound';
  if (ensChgPct > 2.2) marketBias = 'Bullish';
  else if (ensChgPct > 0.5) marketBias = 'Moderately Bullish';
  else if (ensChgPct < -2.2) marketBias = 'Bearish';
  else if (ensChgPct < -0.5) marketBias = 'Moderately Bearish';

  const bullishModelsCount = singleEnds.filter((p) => p > lastPrice).length;
  const agreementRatio = Math.max(bullishModelsCount, models.length - bullishModelsCount) / models.length;

  const confidenceGrade: ComparativeSummary['confidenceGrade'] =
    agreementRatio >= 0.8 &&
    volatility.trendReliabilityScore !== 'Low' &&
    modelDispersionPct < 3.5
      ? 'High'
      : agreementRatio >= 0.6 && volatility.trendReliabilityScore !== 'Low'
      ? 'Moderate'
      : 'Cautious';

  const horizonLabel = frequency === 'monthly' ? '3-Month Close Horizon' : '10-Day Trading Horizon';

  const executiveNarrative = `Across ${n} ${frequency} observations (${stats.startDate} to ${stats.endDate}), out-of-sample holdout validation (n=${holdoutSize}) identifies ${bestSingle.name} as the lowest-error individual estimator (RMSE=${bestSingle.metrics.rmse.toFixed(3)}, MAPE=${bestSingle.metrics.mape.toFixed(2)}%), while ${bestDir.shortName} leads in directional hit-rate (${bestDir.metrics.directionalAccuracy.toFixed(1)}%). Over the ${horizonLabel.toLowerCase()}, the inverse-RMSE weighted ensemble projects ${ensEnd.toFixed(2)} (${ensChgPct >= 0 ? '+' : ''}${ensChgPct.toFixed(2)}% from ${lastPrice.toFixed(2)}) with inter-model dispersion of ${modelDispersionPct.toFixed(2)}%. Volatility diagnostics under ${volatility.preferredVolatilityModel} place annualized conditional volatility at ${volatility.currentAnnualizedVolPct.toFixed(1)}% (${volatility.volatilityRegime}, ${volatility.volatilityTrend}).`;

  const methodologyFindings: string[] = [
    `Linear Econometrics (${arima.name}): ${stats.isStationaryLevel ? 'Series is level-stationary' : `Unit root rejected after d=${arima.order.d} differencing (ADF t=${stats.adfStatistic.toFixed(2)})`}. Ljung-Box Q=${arima.ljungBoxQ.toFixed(2)} (p=${arima.ljungBoxP.toFixed(3)}).`,
    `Kernel Machine Learning (SVR-RBF): Captured nonlinear return-momentum manifolds using ${svr.numSupportVectors} support vectors (${svr.supportVectorRatioPct.toFixed(1)}% density), achieving holdout MAPE of ${svr.metrics.mape.toFixed(2)}%.`,
    `Evolutionary Deep Sequence (GA-RNN): Genetic optimization across ${rnnGa.gaConfig.generations} generations reduced validation MSE to ${rnnGa.fitnessHistory[rnnGa.fitnessHistory.length - 1]?.bestMse.toFixed(4) ?? '—'}, yielding ${rnnGa.metrics.directionalAccuracy.toFixed(1)}% directional accuracy.`,
    `Regime & State-Space (HMM & Kalman): HMM assigns ${(hmm.currentStateProbabilities[hmm.currentDominantState] * 100).toFixed(1)}% probability to "${hmm.stateLabels[hmm.currentDominantState]}", while Kalman local trend estimates latent slope β=${kalman.finalSlope >= 0 ? '+' : ''}${kalman.finalSlope.toFixed(3)}/bar.`,
    `Conditional Volatility (AR(2)-GARCH vs AR(2)-EGARCH): ${volatility.preferredVolatilityModel} provides superior AIC fit (${Math.min(volatility.garch.aic, volatility.egarch.aic).toFixed(1)}). ${volatility.leverageCommentary}`,
  ];

  const conclusiveSuggestion =
    confidenceGrade === 'High'
      ? `Conclusive Guidance (${marketBias} · High Conviction): Strong cross-paradigm agreement (${Math.round(agreementRatio * 5)}/5 models aligned) combined with ${volatility.volatilityRegime.toLowerCase()} supports relying on the ${ensEnd.toFixed(2)} consensus trajectory (${ensChgPct >= 0 ? '+' : ''}${ensChgPct.toFixed(2)}%). Maintain risk sizing anchored to ${volatility.preferredVolatilityModel} 95% Value-at-Risk (${(volatility.preferredVolatilityModel === 'AR(2)-EGARCH(1,1)' ? volatility.egarch.var95Pct : volatility.garch.var95Pct).toFixed(2)}% per period).`
      : confidenceGrade === 'Moderate'
      ? `Conclusive Guidance (${marketBias} · Moderate Conviction): Majority model alignment favors a ${marketBias.toLowerCase()} bias toward ${ensEnd.toFixed(2)}, though ${volatility.volatilityRegime.toLowerCase()} (${volatility.currentAnnualizedVolPct.toFixed(1)}% ann.) warrants staggered positioning and monitoring ${hmm.stateLabels[hmm.currentDominantState]} transition thresholds.`
      : `Conclusive Guidance (${marketBias} · Cautious / High Uncertainty): Elevated inter-model dispersion (${modelDispersionPct.toFixed(2)}%) or ${volatility.volatilityRegime.toLowerCase()} reduces point-forecast reliability. Prioritize dynamic volatility hedging via ${volatility.preferredVolatilityModel} (99% VaR: ${(volatility.preferredVolatilityModel === 'AR(2)-EGARCH(1,1)' ? volatility.egarch.var99Pct : volatility.garch.var99Pct).toFixed(2)}%) and await regime stabilization before committing directional exposure.`;

  const academicCaveats: string[] = [
    `Financial return series exhibit excess kurtosis (${stats.excessKurtosis.toFixed(2)}) and non-normal tails (Jarque-Bera p=${stats.jarqueBeraPValue.toFixed(4)}); normal confidence bands may understate extreme tail events.`,
    `Multi-step recursive ML forecasts (SVR, GA-RNN) compound one-step estimation error across longer horizons; ensemble weighting mitigates single-model variance.`,
    `Volatility persistence (${(volatility.preferredVolatilityModel === 'AR(2)-EGARCH(1,1)' ? volatility.egarch.persistence : volatility.garch.persistence).toFixed(3)}) implies shock decay half-life of ${
      (volatility.preferredVolatilityModel === 'AR(2)-EGARCH(1,1)' ? volatility.egarch.halfLifePeriods : volatility.garch.halfLifePeriods)?.toFixed(1) ?? '∞'
    } periods.`,
  ];

  const summary: ComparativeSummary = {
    bestPointModelId: bestSingle.id as ModelId,
    bestPointModelName: bestSingle.name,
    bestDirectionalModelName: bestDir.name,
    rankedModels,
    lastObservedPrice: lastPrice,
    lastObservedDate: lastDate,
    horizonSteps,
    horizonLabel,
    ensembleEndPrice: ensEnd,
    ensembleImpliedChangePct: ensChgPct,
    modelDispersionPct,
    marketBias,
    confidenceGrade,
    executiveNarrative,
    methodologyFindings,
    conclusiveSuggestion,
    academicCaveats,
  };

  return {
    datasetName,
    frequency,
    horizonSteps,
    holdoutSize,
    series,
    stats,
    arima,
    svr,
    rnnGa,
    hmm,
    kalman,
    ensemble,
    volatility,
    summary,
    generatedAtIso: new Date().toISOString(),
  };
}
