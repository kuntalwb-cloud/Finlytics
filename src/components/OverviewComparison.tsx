import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { FullAnalysisResult, ModelId } from '../types/timeseries';
import { LineSeries, MultiSeriesChart } from './InteractiveCharts';

interface OverviewComparisonProps {
  result: FullAnalysisResult;
  onInspectModel: (modelId: ModelId) => void;
  onGoToSummary: () => void;
}

const MODEL_COLORS: Record<ModelId, string> = {
  ensemble: '#1d4ed8',
  arima: '#0f766e',
  svr: '#b45309',
  rnn_ga: '#7c3aed',
  hmm: '#be123c',
  kalman: '#0369a1',
};

export const OverviewComparison: React.FC<OverviewComparisonProps> = ({
  result,
  onInspectModel,
  onGoToSummary,
}) => {
  const [windowBars, setWindowBars] = useState<number>(60);
  const [showBands, setShowBands] = useState<boolean>(true);
  const [visibleModels, setVisibleModels] = useState<Record<ModelId, boolean>>({
    ensemble: true,
    arima: true,
    svr: true,
    rnn_ga: true,
    hmm: true,
    kalman: true,
  });

  const toggleModel = (id: ModelId) => {
    setVisibleModels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const chartData = useMemo(() => {
    const totalHist = result.series.length;
    const histCount = windowBars === 0 ? totalHist : Math.min(totalHist, windowBars);
    const startIdx = totalHist - histCount;
    const slicedSeries = result.series.slice(startIdx);

    const labels = [
      ...slicedSeries.map((d) => d.date),
      ...result.ensemble.forecast.map((f) => f.date),
    ];
    const nullsFuture = new Array(result.horizonSteps).fill(null);
    const nullsHist = new Array(Math.max(0, histCount - 1)).fill(null);
    const lastHistPrice = slicedSeries[slicedSeries.length - 1].close;

    const actualSeries: LineSeries = {
      id: 'actual',
      label: 'Historical Close',
      color: '#0f172a',
      strokeWidth: 2.4,
      values: [...slicedSeries.map((d) => d.close), ...nullsFuture],
    };

    const makeForecastSeries = (id: ModelId, label: string, pts: { point: number }[], dashed = false): LineSeries => ({
      id,
      label,
      color: MODEL_COLORS[id],
      strokeWidth: id === 'ensemble' ? 2.6 : 1.7,
      dashed,
      values: [...nullsHist, lastHistPrice, ...pts.map((p) => p.point)],
    });

    const forecastLines: LineSeries[] = [];
    if (visibleModels.arima) forecastLines.push(makeForecastSeries('arima', result.arima.shortName, result.arima.forecast, true));
    if (visibleModels.svr) forecastLines.push(makeForecastSeries('svr', result.svr.shortName, result.svr.forecast, true));
    if (visibleModels.rnn_ga) forecastLines.push(makeForecastSeries('rnn_ga', result.rnnGa.shortName, result.rnnGa.forecast, true));
    if (visibleModels.hmm) forecastLines.push(makeForecastSeries('hmm', result.hmm.shortName, result.hmm.forecast, true));
    if (visibleModels.kalman) forecastLines.push(makeForecastSeries('kalman', result.kalman.shortName, result.kalman.forecast, true));
    if (visibleModels.ensemble) forecastLines.push(makeForecastSeries('ensemble', 'Ensemble Consensus', result.ensemble.forecast, false));

    const bandLower = showBands
      ? [...nullsHist, lastHistPrice, ...result.ensemble.forecast.map((f) => f.lower95)]
      : undefined;
    const bandUpper = showBands
      ? [...nullsHist, lastHistPrice, ...result.ensemble.forecast.map((f) => f.upper95)]
      : undefined;

    return {
      labels,
      series: [actualSeries, ...forecastLines],
      forecastStartIndex: histCount,
      bandLower,
      bandUpper,
    };
  }, [result, windowBars, showBands, visibleModels]);

  const { summary, volatility } = result;
  const biasTone =
    summary.ensembleImpliedChangePct >= 0.5
      ? 'text-emerald-700'
      : summary.ensembleImpliedChangePct <= -0.5
      ? 'text-red-700'
      : 'text-slate-700';

  return (
    <div className="space-y-6">
      {/* Page Title & Metadata */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Multi-Model Forecast &amp; Performance Overview
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{result.datasetName}</span>
            <span aria-hidden="true">·</span>
            <span>{summary.horizonLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Holdout validation n={result.holdoutSize}</span>
            <span aria-hidden="true">·</span>
            <span>Last observed {summary.lastObservedDate}: {summary.lastObservedPrice.toFixed(2)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToSummary}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          Comparative Summary &amp; Export
          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Ensemble Consensus Target</div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {summary.ensembleEndPrice.toFixed(2)}
            </span>
            <span className={`text-xs font-semibold font-mono tabular-nums ${biasTone}`}>
              {summary.ensembleImpliedChangePct >= 0 ? '+' : ''}
              {summary.ensembleImpliedChangePct.toFixed(2)}%
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {summary.marketBias} · {summary.confidenceGrade} Conviction
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Best Individual Estimator (RMSE)</div>
          <div className="mt-1.5 text-lg font-bold text-slate-900 truncate" title={summary.bestPointModelName}>
            {summary.bestPointModelName}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Dir. Leader: {summary.bestDirectionalModelName}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Conditional Volatility ({volatility.preferredVolatilityModel})</div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {volatility.currentAnnualizedVolPct.toFixed(1)}%
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-600">
              → {volatility.forecastEndAnnualizedVolPct.toFixed(1)}%
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {volatility.volatilityRegime} · {volatility.volatilityTrend}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Inter-Model Dispersion &amp; Reliability</div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
              {summary.modelDispersionPct.toFixed(2)}%
            </span>
            <span className="text-xs font-medium text-slate-600">
              Trend Reliability: {volatility.trendReliabilityScore}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            HMM Dominant: {result.hmm.stateLabels[result.hmm.currentDominantState]}
          </div>
        </div>
      </div>

      {/* Main Forecast Overlay Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Multi-Methodology Forecast Trajectory ({result.horizonSteps}-Step Horizon)
            </h2>
            <p className="text-xs text-slate-500">
              Hover over chart to inspect point forecasts across all econometric, ML, state-space, and regime models.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { label: '40 Bars', val: 40 },
                { label: '90 Bars', val: 90 },
                { label: 'Full', val: 0 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setWindowBars(opt.val)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    windowBars === opt.val ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowBands((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                showBands
                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              95% CI Band
            </button>
          </div>
        </div>

        {/* Interactive Legend Toggles */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(
            [
              { id: 'ensemble', label: 'Ensemble' },
              { id: 'arima', label: result.arima.shortName },
              { id: 'svr', label: 'SVR (RBF)' },
              { id: 'rnn_ga', label: 'GA-RNN' },
              { id: 'hmm', label: 'HMM (3-State)' },
              { id: 'kalman', label: 'Kalman Filter' },
            ] as { id: ModelId; label: string }[]
          ).map((item) => {
            const active = visibleModels[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleModel(item.id)}
                className={`inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  active
                    ? 'border-slate-300 bg-white text-slate-900'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: active ? MODEL_COLORS[item.id] : '#cbd5e1' }}
                />
                {item.label}
              </button>
            );
          })}
        </div>

        <MultiSeriesChart
          labels={chartData.labels}
          series={chartData.series}
          forecastStartIndex={chartData.forecastStartIndex}
          bandLower={chartData.bandLower}
          bandUpper={chartData.bandUpper}
          height={360}
        />
      </section>

      {/* Ranked Performance Comparison Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Out-of-Sample Model Performance Comparison
            </h2>
            <p className="text-xs text-slate-500">
              Ranked by holdout Root Mean Squared Error (RMSE). Click any individual methodology to inspect full diagnostics.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 font-semibold">Rank</th>
                <th className="py-2.5 px-4 font-semibold">Model</th>
                <th className="py-2.5 px-4 font-semibold">Methodology</th>
                <th className="py-2.5 px-4 font-semibold text-right">RMSE</th>
                <th className="py-2.5 px-4 font-semibold text-right">MAE</th>
                <th className="py-2.5 px-4 font-semibold text-right">MAPE</th>
                <th className="py-2.5 px-4 font-semibold text-right">Dir. Acc.</th>
                <th className="py-2.5 px-4 font-semibold text-right">Theil&apos;s U</th>
                <th className="py-2.5 px-4 font-semibold text-right">Target</th>
                <th className="py-2.5 px-4 font-semibold text-right">Implied Chg</th>
                <th className="py-2.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.rankedModels.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-4 font-mono tabular-nums font-semibold text-slate-700">#{row.rank}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">{row.name}</td>
                  <td className="py-2.5 px-4 text-slate-600">{row.category}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">{row.rmse.toFixed(4)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">{row.mae.toFixed(4)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">{row.mape.toFixed(2)}%</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">{row.directionalAccuracy.toFixed(1)}%</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">{row.theilU.toFixed(4)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {row.horizonEndPrice.toFixed(2)}
                  </td>
                  <td
                    className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                      row.impliedChangePct >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {row.impliedChangePct >= 0 ? '+' : ''}
                    {row.impliedChangePct.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {row.id !== 'ensemble' ? (
                      <button
                        type="button"
                        onClick={() => onInspectModel(row.id)}
                        className="text-blue-700 hover:text-blue-900 font-medium whitespace-nowrap"
                      >
                        Inspect
                      </button>
                    ) : (
                      <span className="text-slate-400">Weighted</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Step-by-Step Forecast Matrix */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Step-by-Step Horizon Forecast Schedule ({result.horizonSteps} {result.frequency === 'monthly' ? 'Months' : 'Days'})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 font-semibold">Step</th>
                <th className="py-2.5 px-4 font-semibold">Period</th>
                <th className="py-2.5 px-4 font-semibold text-right">ARIMA</th>
                <th className="py-2.5 px-4 font-semibold text-right">SVR (RBF)</th>
                <th className="py-2.5 px-4 font-semibold text-right">GA-RNN</th>
                <th className="py-2.5 px-4 font-semibold text-right">HMM</th>
                <th className="py-2.5 px-4 font-semibold text-right">Kalman</th>
                <th className="py-2.5 px-4 font-semibold text-right">Ensemble</th>
                <th className="py-2.5 px-4 font-semibold text-right">95% CI Range</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.ensemble.forecast.map((ef, idx) => (
                <tr key={ef.step} className="hover:bg-slate-50/80">
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">+{ef.step}</td>
                  <td className="py-2.5 px-4 font-mono tabular-nums text-slate-900">{ef.date}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {result.arima.forecast[idx].point.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {result.svr.forecast[idx].point.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {result.rnnGa.forecast[idx].point.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {result.hmm.forecast[idx].point.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                    {result.kalman.forecast[idx].point.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-blue-700">
                    {ef.point.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                    {ef.lower95.toFixed(2)} – {ef.upper95.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
