import React from 'react';
import { FullAnalysisResult } from '../types/timeseries';
import { MultiSeriesChart } from './InteractiveCharts';

interface VolatilityLabViewProps {
  result: FullAnalysisResult;
}

export const VolatilityLabView: React.FC<VolatilityLabViewProps> = ({ result }) => {
  const { volatility } = result;
  const histSlice = volatility.historicalVolatility.slice(-90);
  const labels = [
    ...histSlice.map((v) => v.date),
    ...volatility.forecastVolatility.map((v) => v.date),
  ];
  const nullsFuture = new Array(volatility.forecastVolatility.length).fill(null);
  const nullsHist = new Array(Math.max(0, histSlice.length - 1)).fill(null);

  const lastGarch = histSlice[histSlice.length - 1]?.garchVolAnnPct ?? 15;
  const lastEgarch = histSlice[histSlice.length - 1]?.egarchVolAnnPct ?? 15;

  const garchSeries = [
    ...histSlice.map((v) => v.garchVolAnnPct),
    ...nullsFuture,
  ];
  const egarchSeries = [
    ...histSlice.map((v) => v.egarchVolAnnPct),
    ...nullsFuture,
  ];
  const garchForecast = [
    ...nullsHist,
    lastGarch,
    ...volatility.forecastVolatility.map((v) => v.garchVolAnnPct),
  ];
  const egarchForecast = [
    ...nullsHist,
    lastEgarch,
    ...volatility.forecastVolatility.map((v) => v.egarchVolAnnPct),
  ];

  const g = volatility.garch;
  const eg = volatility.egarch;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Volatility Prediction &amp; Trend Reliability Lab
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span>AR(2)-GARCH(1,1) vs AR(2)-EGARCH(1,1)</span>
          <span aria-hidden="true">·</span>
          <span>Preferred AIC Model: {volatility.preferredVolatilityModel}</span>
          <span aria-hidden="true">·</span>
          <span>Trend Reliability: {volatility.trendReliabilityScore}</span>
        </div>
      </div>

      {/* Volatility Summary Banner */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Trend Assessment &amp; Leverage Synthesis
        </div>
        <p className="text-sm text-slate-800 leading-relaxed">{volatility.trendAssessmentSummary}</p>
        <p className="text-xs text-slate-600 leading-relaxed">{volatility.leverageCommentary}</p>
      </div>

      {/* 4-Column Volatility KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Current Annualized Volatility</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {volatility.currentAnnualizedVolPct.toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">{volatility.volatilityRegime}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Horizon-End Forecast Vol</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {volatility.forecastEndAnnualizedVolPct.toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">{volatility.volatilityTrend}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">EGARCH Leverage (γ₁)</div>
          <div
            className={`mt-1 text-2xl font-bold font-mono tabular-nums ${
              volatility.leverageEffectDetected ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {(eg.gamma1 ?? 0).toFixed(4)}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {volatility.leverageEffectDetected ? 'Asymmetric Downside Amplification' : 'Near-Symmetric Shock Response'}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">1-Period 95% Value-at-Risk</div>
          <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-red-700">
            -{(volatility.preferredVolatilityModel === 'AR(2)-EGARCH(1,1)' ? eg.var95Pct : g.var95Pct).toFixed(2)}%
          </div>
          <div className="mt-1 text-xs text-slate-500">
            99% VaR: -{(volatility.preferredVolatilityModel === 'AR(2)-EGARCH(1,1)' ? eg.var99Pct : g.var99Pct).toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Historical + Forecast Volatility Chart */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900">
              Conditional Annualized Volatility Trajectory &amp; {result.horizonSteps}-Step Forecast (%)
            </h2>
            <p className="text-xs text-slate-500">
              AR(2) mean-filtered conditional standard deviation annualized by √{result.frequency === 'monthly' ? 12 : 252}.
            </p>
          </div>
        </div>
        <MultiSeriesChart
          labels={labels}
          series={[
            { id: 'garch_hist', label: 'AR(2)-GARCH(1,1)', color: '#0369a1', values: garchSeries, strokeWidth: 2 },
            { id: 'egarch_hist', label: 'AR(2)-EGARCH(1,1)', color: '#be123c', values: egarchSeries, strokeWidth: 2 },
            { id: 'garch_fc', label: 'GARCH Forecast', color: '#0369a1', values: garchForecast, dashed: true, strokeWidth: 2.2 },
            { id: 'egarch_fc', label: 'EGARCH Forecast', color: '#be123c', values: egarchForecast, dashed: true, strokeWidth: 2.2 },
          ]}
          forecastStartIndex={histSlice.length}
          valueSuffix="%"
          height={310}
        />
      </section>

      {/* News Impact Curve + Parameter Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            News Impact Curve (Standardized Shock z_&#123;t-1&#125; vs Annualized Vol)
          </h2>
          <p className="text-xs text-slate-500">
            Demonstrates symmetric quadratic response of GARCH(1,1) versus asymmetric leverage tilt of EGARCH(1,1) for negative shocks (z &lt; 0).
          </p>
          <MultiSeriesChart
            labels={volatility.newsImpactCurve.map((p) => `${p.shockZ.toFixed(1)}σ`)}
            series={[
              {
                id: 'nic_garch',
                label: 'AR(2)-GARCH(1,1)',
                color: '#0369a1',
                values: volatility.newsImpactCurve.map((p) => p.garchResponseVar),
                strokeWidth: 2.2,
              },
              {
                id: 'nic_egarch',
                label: 'AR(2)-EGARCH(1,1)',
                color: '#be123c',
                values: volatility.newsImpactCurve.map((p) => p.egarchResponseVar),
                strokeWidth: 2.2,
              },
            ]}
            valueSuffix="%"
            height={250}
          />
        </section>

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-base font-semibold text-slate-900">
              QMLE Parameter &amp; Information Criterion Comparison
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-2.5 px-4 text-left font-semibold">Parameter / Diagnostic</th>
                  <th className="py-2.5 px-4 text-right font-semibold">AR(2)-GARCH(1,1)</th>
                  <th className="py-2.5 px-4 text-right font-semibold">AR(2)-EGARCH(1,1)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  ['Mean AR(2): φ₀ / φ₁ / φ₂', `${g.arPhi0.toFixed(4)} / ${g.arPhi1.toFixed(3)} / ${g.arPhi2.toFixed(3)}`, `${eg.arPhi0.toFixed(4)} / ${eg.arPhi1.toFixed(3)} / ${eg.arPhi2.toFixed(3)}`],
                  ['Intercept ω', g.omega.toExponential(2), eg.omega.toFixed(4)],
                  ['ARCH / Magnitude α₁', g.alpha1.toFixed(4), eg.alpha1.toFixed(4)],
                  ['GARCH / Persistence β₁', g.beta1.toFixed(4), eg.beta1.toFixed(4)],
                  ['Leverage Asymmetry γ₁', '0.0000 (Symmetric)', (eg.gamma1 ?? 0).toFixed(4)],
                  ['Volatility Persistence', g.persistence.toFixed(4), eg.persistence.toFixed(4)],
                  ['Shock Half-Life (Periods)', g.halfLifePeriods ? g.halfLifePeriods.toFixed(1) : '∞', eg.halfLifePeriods ? eg.halfLifePeriods.toFixed(1) : '∞'],
                  ['Long-Run Unconditional Vol', `${g.unconditionalVolAnnPct.toFixed(2)}%`, `${eg.unconditionalVolAnnPct.toFixed(2)}%`],
                  ['Log-Likelihood', g.logLikelihood.toFixed(2), eg.logLikelihood.toFixed(2)],
                  ['AIC (Lower Preferred)', g.aic.toFixed(2), eg.aic.toFixed(2)],
                  ['BIC', g.bic.toFixed(2), eg.bic.toFixed(2)],
                  ['1-Step 95% VaR / CVaR', `${g.var95Pct.toFixed(2)}% / ${g.cvar95Pct.toFixed(2)}%`, `${eg.var95Pct.toFixed(2)}% / ${eg.cvar95Pct.toFixed(2)}%`],
                ].map(([label, gv, egv]) => (
                  <tr key={label} className="hover:bg-slate-50">
                    <td className="py-2 px-4 font-medium text-slate-700">{label}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-900">{gv}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-900">{egv}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Forecast Volatility Schedule */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Horizon Conditional Volatility Forecast Schedule
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 text-left font-semibold">Step</th>
                <th className="py-2.5 px-4 text-left font-semibold">Period</th>
                <th className="py-2.5 px-4 text-right font-semibold">GARCH Period σ</th>
                <th className="py-2.5 px-4 text-right font-semibold">GARCH Annualized σ</th>
                <th className="py-2.5 px-4 text-right font-semibold">EGARCH Period σ</th>
                <th className="py-2.5 px-4 text-right font-semibold">EGARCH Annualized σ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {volatility.forecastVolatility.map((vf) => (
                <tr key={vf.step} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-mono tabular-nums text-slate-600">+{vf.step}</td>
                  <td className="py-2 px-4 font-mono tabular-nums text-slate-900">{vf.date}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700">
                    {vf.garchPeriodVolPct.toFixed(3)}%
                  </td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-sky-800">
                    {vf.garchVolAnnPct.toFixed(2)}%
                  </td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-700">
                    {vf.egarchPeriodVolPct.toFixed(3)}%
                  </td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-rose-800">
                    {vf.egarchVolAnnPct.toFixed(2)}%
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
