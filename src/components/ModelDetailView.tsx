import React from 'react';
import { BaseModelResult, FullAnalysisResult, ModelId } from '../types/timeseries';
import { BarDiagnosticChart, MultiSeriesChart } from './InteractiveCharts';

interface ModelDetailViewProps {
  result: FullAnalysisResult;
  selectedModel: Exclude<ModelId, 'ensemble'>;
  onSelectModel: (id: Exclude<ModelId, 'ensemble'>) => void;
}

const MODEL_TABS: { id: Exclude<ModelId, 'ensemble'>; label: string }[] = [
  { id: 'arima', label: 'ARIMA' },
  { id: 'svr', label: 'SVR (RBF)' },
  { id: 'rnn_ga', label: 'GA-RNN' },
  { id: 'hmm', label: 'HMM (3-State)' },
  { id: 'kalman', label: 'Kalman Filter' },
];

export const ModelDetailView: React.FC<ModelDetailViewProps> = ({
  result,
  selectedModel,
  onSelectModel,
}) => {
  const modelMap: Record<Exclude<ModelId, 'ensemble'>, BaseModelResult> = {
    arima: result.arima,
    svr: result.svr,
    rnn_ga: result.rnnGa,
    hmm: result.hmm,
    kalman: result.kalman,
  };
  const m = modelMap[selectedModel];

  const histWindow = Math.min(result.series.length, 80);
  const startIdx = result.series.length - histWindow;
  const slicedSeries = result.series.slice(startIdx);
  const slicedFitted = m.fitted.slice(startIdx);
  const labels = [...slicedSeries.map((s) => s.date), ...m.forecast.map((f) => f.date)];
  const nullsFuture = new Array(m.forecast.length).fill(null);
  const nullsHist = new Array(Math.max(0, histWindow - 1)).fill(null);
  const lastActual = slicedSeries[slicedSeries.length - 1].close;

  const actualVals = [...slicedSeries.map((s) => s.close), ...nullsFuture];
  const fittedVals = [...slicedFitted, ...nullsFuture];
  const forecastVals = [...nullsHist, lastActual, ...m.forecast.map((f) => f.point)];
  const bandLower = [...nullsHist, lastActual, ...m.forecast.map((f) => f.lower95)];
  const bandUpper = [...nullsHist, lastActual, ...m.forecast.map((f) => f.upper95)];

  const regimeStates =
    selectedModel === 'hmm'
      ? [...result.hmm.historicalStates.slice(startIdx), ...m.forecast.map(() => result.hmm.currentDominantState)]
      : undefined;

  return (
    <div className="space-y-6">
      {/* Header & Model Segmented Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">{m.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{m.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{m.computationMs.toFixed(1)} ms runtime</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">Holdout RMSE {m.metrics.rmse.toFixed(4)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto">
          {MODEL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectModel(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedModel === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Specification & Interpretation */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Mathematical Specification &amp; Analytical Summary
        </div>
        <div className="font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-slate-800 overflow-x-auto">
          {m.equationSummary}
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{m.interpretation}</p>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Holdout RMSE', val: m.metrics.rmse.toFixed(4) },
          { label: 'Holdout MAE', val: m.metrics.mae.toFixed(4) },
          { label: 'Holdout MAPE', val: `${m.metrics.mape.toFixed(2)}%` },
          { label: 'Dir. Accuracy', val: `${m.metrics.directionalAccuracy.toFixed(1)}%` },
          { label: "Theil's U", val: m.metrics.theilU.toFixed(4) },
          { label: 'Out-of-Sample R²', val: m.metrics.rSquared.toFixed(3) },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-3.5">
            <div className="text-xs text-slate-500">{item.label}</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">{item.val}</div>
          </div>
        ))}
      </div>

      {/* Fitted vs Actual + Horizon Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            In-Sample Fit &amp; {result.horizonSteps}-Step Horizon Projection (95% Prediction Interval)
          </h2>
          {selectedModel === 'hmm' && (
            <span className="text-xs text-slate-500">
              Shading: Green = Bull Regime · Gray = Neutral · Red = Bear Regime
            </span>
          )}
        </div>
        <MultiSeriesChart
          labels={labels}
          series={[
            { id: 'actual', label: 'Actual Close', color: '#0f172a', values: actualVals, strokeWidth: 2.2 },
            { id: 'fitted', label: 'Model Fitted', color: '#64748b', values: fittedVals, dashed: true, strokeWidth: 1.5 },
            { id: 'forecast', label: `${m.shortName} Forecast`, color: '#1d4ed8', values: forecastVals, strokeWidth: 2.5 },
          ]}
          forecastStartIndex={histWindow}
          bandLower={bandLower}
          bandUpper={bandUpper}
          regimeStates={regimeStates}
          height={320}
        />
      </section>

      {/* Model-Specific Deep Diagnostics */}
      {selectedModel === 'arima' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              ARIMA Parameter Estimates &amp; Residual Tests
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Order (p, d, q)</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  ({result.arima.order.p}, {result.arima.order.d}, {result.arima.order.q})
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">AIC / BIC</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.arima.metrics.aic?.toFixed(1)} / {result.arima.metrics.bic?.toFixed(1)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Ljung-Box Q (p-val)</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.arima.ljungBoxQ.toFixed(2)} (p={result.arima.ljungBoxP.toFixed(3)})
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">ADF Level Stat (p-val)</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.stats.adfStatistic.toFixed(2)} (p={result.stats.adfPValue.toFixed(3)})
                </div>
              </div>
            </div>
            <div className="text-xs space-y-1 font-mono text-slate-700 pt-1">
              <div>Intercept μ: {result.arima.intercept.toFixed(5)}</div>
              <div>
                AR φ: [{result.arima.arCoeffs.length ? result.arima.arCoeffs.map((c) => c.toFixed(4)).join(', ') : 'none'}]
              </div>
              <div>
                MA θ: [{result.arima.maCoeffs.length ? result.arima.maCoeffs.map((c) => c.toFixed(4)).join(', ') : 'none'}]
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Residual Autocorrelation (ACF) vs 95% White-Noise Bounds
            </h3>
            <BarDiagnosticChart
              values={result.arima.residualAcf.slice(1)}
              labels={result.arima.residualAcf.slice(1).map((_, i) => `L${i + 1}`)}
              thresholdLine={1.96 / Math.sqrt(Math.max(10, result.series.length))}
            />
          </div>
        </div>
      )}

      {selectedModel === 'svr' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              SVR Kernel Hyperparameters &amp; Dual Geometry
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Kernel &amp; Box C</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  RBF · C = {result.svr.cParam.toFixed(2)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">RBF γ / ε-Tube</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  γ={result.svr.gamma.toFixed(4)} · ε={result.svr.epsilon}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Support Vectors</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.svr.numSupportVectors} ({result.svr.supportVectorRatioPct.toFixed(1)}%)
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Return Lag Window</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.svr.lookbackLags} lags + MA/Vol features
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Permutation Feature Sensitivity (%)
            </h3>
            <div className="space-y-2">
              {result.svr.featureImportance.slice(0, 6).map((f) => (
                <div key={f.feature} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700">{f.feature}</span>
                    <span className="font-mono tabular-nums text-slate-900">{f.weight.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-600 rounded-full"
                      style={{ width: `${Math.min(100, f.weight)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedModel === 'rnn_ga' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Genetic Algorithm &amp; Elman RNN Topology
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Recurrent Architecture</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  Win={result.rnnGa.architecture.inputWindow} · H={result.rnnGa.architecture.hiddenUnits} (tanh)
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">GA Population / Gen</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  Pop={result.rnnGa.gaConfig.populationSize} · Gen={result.rnnGa.gaConfig.generations}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Evolved Learning Rate</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  η = {result.rnnGa.gaConfig.bestLearningRate.toFixed(4)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Final Train MSE (Norm)</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.rnnGa.finalTrainLoss.toFixed(4)}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              GA Fitness Convergence (Validation MSE Across Generations)
            </h3>
            <MultiSeriesChart
              labels={result.rnnGa.fitnessHistory.map((g) => `G${g.generation}`)}
              series={[
                {
                  id: 'best',
                  label: 'Best Chromosome MSE',
                  color: '#7c3aed',
                  values: result.rnnGa.fitnessHistory.map((g) => g.bestMse),
                },
                {
                  id: 'avg',
                  label: 'Population Mean MSE',
                  color: '#94a3b8',
                  dashed: true,
                  values: result.rnnGa.fitnessHistory.map((g) => g.avgMse),
                },
              ]}
              height={210}
            />
          </div>
        </div>
      )}

      {selectedModel === 'hmm' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Regime Emission Parameters &amp; Terminal Posterior Probabilities
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left font-semibold">State</th>
                  <th className="py-2 text-right font-semibold">Mean Return</th>
                  <th className="py-2 text-right font-semibold">State σ</th>
                  <th className="py-2 text-right font-semibold">Terminal Prob</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.hmm.stateLabels.map((lbl, k) => (
                  <tr key={lbl}>
                    <td className="py-2 font-medium text-slate-900">{lbl}</td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {result.hmm.stateMeansPct[k] >= 0 ? '+' : ''}
                      {result.hmm.stateMeansPct[k].toFixed(3)}%
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums">
                      {result.hmm.stateVolsPct[k].toFixed(3)}%
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold text-blue-700">
                      {(result.hmm.currentStateProbabilities[k] * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Markov Transition Matrix P(S_t = j | S_&#123;t-1&#125; = i)
            </h3>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 text-left">From \ To</th>
                  <th className="py-2 text-right">Bear</th>
                  <th className="py-2 text-right">Neutral</th>
                  <th className="py-2 text-right">Bull</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.hmm.transitionMatrix.map((row, i) => (
                  <tr key={i}>
                    <td className="py-2 font-medium text-slate-700">
                      {['Bear', 'Neutral', 'Bull'][i]}
                    </td>
                    {row.map((prob, j) => (
                      <td key={j} className="py-2 text-right font-mono tabular-nums text-slate-900">
                        {(prob * 100).toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedModel === 'kalman' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              State-Space Variance Parameters &amp; Terminal State
            </h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Observation Noise H</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.kalman.observationVarH.toFixed(4)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Level Noise Q_μ</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.kalman.levelNoiseVarQ.toFixed(4)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Signal-to-Noise Ratio</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.kalman.signalToNoiseRatio.toFixed(3)}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-slate-500">Terminal Level / Slope</div>
                <div className="font-mono font-semibold text-slate-900 mt-0.5">
                  {result.kalman.finalLevel.toFixed(2)} ({result.kalman.finalSlope >= 0 ? '+' : ''}
                  {result.kalman.finalSlope.toFixed(3)}/bar)
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              RTS Smoothed Latent Trend vs Observed Price
            </h3>
            <MultiSeriesChart
              labels={slicedSeries.map((s) => s.date)}
              series={[
                { id: 'obs', label: 'Observed Price', color: '#94a3b8', values: slicedSeries.map((s) => s.close), strokeWidth: 1.5 },
                {
                  id: 'smooth',
                  label: 'RTS Smoothed Level μ_t',
                  color: '#0369a1',
                  values: result.kalman.smoothedLevel.slice(startIdx),
                  strokeWidth: 2.3,
                },
              ]}
              height={210}
            />
          </div>
        </div>
      )}

      {/* Horizon Table for Selected Model */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            {m.shortName} Point Forecasts &amp; 95% Prediction Intervals
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 text-left font-semibold">Step</th>
                <th className="py-2.5 px-4 text-left font-semibold">Period</th>
                <th className="py-2.5 px-4 text-right font-semibold">Point Forecast</th>
                <th className="py-2.5 px-4 text-right font-semibold">Lower 95%</th>
                <th className="py-2.5 px-4 text-right font-semibold">Upper 95%</th>
                <th className="py-2.5 px-4 text-right font-semibold">Implied Chg from Terminal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {m.forecast.map((fp) => {
                const pct = ((fp.point - result.summary.lastObservedPrice) / result.summary.lastObservedPrice) * 100;
                return (
                  <tr key={fp.step} className="hover:bg-slate-50">
                    <td className="py-2 px-4 font-mono tabular-nums text-slate-600">+{fp.step}</td>
                    <td className="py-2 px-4 font-mono tabular-nums text-slate-900">{fp.date}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {fp.point.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-600">
                      {fp.lower95.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-600">
                      {fp.upper95.toFixed(2)}
                    </td>
                    <td
                      className={`py-2 px-4 text-right font-mono tabular-nums font-medium ${
                        pct >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {pct >= 0 ? '+' : ''}
                      {pct.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
