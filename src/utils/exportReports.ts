import * as XLSX from 'xlsx';
import { FullAnalysisResult } from '../types/timeseries';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeSlug(name: string): string {
  return name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export function exportExcelWorkbook(result: FullAnalysisResult) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Executive Summary & Conclusive Findings
  const summaryRows = [
    ['Finlytics — Financial Time-Series Econometrics & ML Report'],
    ['Dataset', result.datasetName],
    ['Frequency', result.frequency === 'monthly' ? 'Monthly (3-Month Close Horizon)' : 'Daily (10-Day Price Horizon)'],
    ['Observations', result.stats.count],
    ['Sample Window', `${result.stats.startDate} to ${result.stats.endDate}`],
    ['Holdout Validation Size', result.holdoutSize],
    ['Last Observed Price', Number(result.summary.lastObservedPrice.toFixed(4))],
    ['Ensemble Target Price', Number(result.summary.ensembleEndPrice.toFixed(4))],
    ['Implied Horizon Return (%)', Number(result.summary.ensembleImpliedChangePct.toFixed(3))],
    ['Market Bias', result.summary.marketBias],
    ['Conviction Grade', result.summary.confidenceGrade],
    ['Best Point Model (RMSE)', result.summary.bestPointModelName],
    ['Best Directional Model', result.summary.bestDirectionalModelName],
    ['Preferred Volatility Model', result.volatility.preferredVolatilityModel],
    ['Current Annualized Vol (%)', Number(result.volatility.currentAnnualizedVolPct.toFixed(2))],
    ['Projected End Vol (%)', Number(result.volatility.forecastEndAnnualizedVolPct.toFixed(2))],
    ['Volatility Regime', result.volatility.volatilityRegime],
    ['Trend Reliability', result.volatility.trendReliabilityScore],
    [],
    ['Executive Narrative'],
    [result.summary.executiveNarrative],
    [],
    ['Conclusive Suggestion'],
    [result.summary.conclusiveSuggestion],
    [],
    ['Methodology Findings'],
    ...result.summary.methodologyFindings.map((f, i) => [`Finding ${i + 1}`, f]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive_Summary');

  // Sheet 2: Model Performance Comparison
  const compHeader = [
    'Rank',
    'Model',
    'Category',
    'RMSE',
    'MAE',
    'MAPE (%)',
    'Directional Accuracy (%)',
    "Theil's U",
    'R-Squared',
    'Horizon Target Price',
    'Implied Change (%)',
  ];
  const compRows = result.summary.rankedModels.map((m) => [
    m.rank,
    m.name,
    m.category,
    Number(m.rmse.toFixed(4)),
    Number(m.mae.toFixed(4)),
    Number(m.mape.toFixed(3)),
    Number(m.directionalAccuracy.toFixed(2)),
    Number(m.theilU.toFixed(4)),
    Number(m.rSquared.toFixed(4)),
    Number(m.horizonEndPrice.toFixed(4)),
    Number(m.impliedChangePct.toFixed(3)),
  ]);
  const wsComp = XLSX.utils.aoa_to_sheet([compHeader, ...compRows]);
  XLSX.utils.book_append_sheet(wb, wsComp, 'Model_Comparison');

  // Sheet 3: Multi-Model Forecast Table
  const fHeader = [
    'Step',
    'Date',
    'ARIMA',
    'SVR (RBF)',
    'GA-RNN',
    'HMM (3-State)',
    'Kalman Filter',
    'Ensemble Consensus',
    'Ensemble Lower 95%',
    'Ensemble Upper 95%',
  ];
  const fRows = result.ensemble.forecast.map((ef, idx) => [
    ef.step,
    ef.date,
    Number(result.arima.forecast[idx].point.toFixed(4)),
    Number(result.svr.forecast[idx].point.toFixed(4)),
    Number(result.rnnGa.forecast[idx].point.toFixed(4)),
    Number(result.hmm.forecast[idx].point.toFixed(4)),
    Number(result.kalman.forecast[idx].point.toFixed(4)),
    Number(ef.point.toFixed(4)),
    Number(ef.lower95.toFixed(4)),
    Number(ef.upper95.toFixed(4)),
  ]);
  const wsForecast = XLSX.utils.aoa_to_sheet([fHeader, ...fRows]);
  XLSX.utils.book_append_sheet(wb, wsForecast, 'Horizon_Forecasts');

  // Sheet 4: Volatility Analysis (AR(2)-GARCH & AR(2)-EGARCH)
  const volHeader = ['Metric', 'AR(2)-GARCH(1,1)', 'AR(2)-EGARCH(1,1)'];
  const g = result.volatility.garch;
  const eg = result.volatility.egarch;
  const volParamRows = [
    ['AR(2) Intercept φ0', g.arPhi0, eg.arPhi0],
    ['AR(2) Lag 1 φ1', g.arPhi1, eg.arPhi1],
    ['AR(2) Lag 2 φ2', g.arPhi2, eg.arPhi2],
    ['Omega ω', g.omega, eg.omega],
    ['Alpha α1', g.alpha1, eg.alpha1],
    ['Beta β1', g.beta1, eg.beta1],
    ['Leverage γ1', 0, eg.gamma1 ?? 0],
    ['Persistence', g.persistence, eg.persistence],
    ['Half-Life (Periods)', g.halfLifePeriods ?? 'Non-Stationary', eg.halfLifePeriods ?? 'Non-Stationary'],
    ['Unconditional Vol Ann. (%)', g.unconditionalVolAnnPct, eg.unconditionalVolAnnPct],
    ['Log-Likelihood', g.logLikelihood, eg.logLikelihood],
    ['AIC', g.aic, eg.aic],
    ['BIC', g.bic, eg.bic],
    ['VaR 95% (1-Period %)', g.var95Pct, eg.var95Pct],
    ['VaR 99% (1-Period %)', g.var99Pct, eg.var99Pct],
    ['CVaR 95% (1-Period %)', g.cvar95Pct, eg.cvar95Pct],
  ];
  const vfHeader = [
    [],
    ['Forecast Step', 'Date', 'GARCH Ann. Vol (%)', 'EGARCH Ann. Vol (%)', 'GARCH Period Vol (%)', 'EGARCH Period Vol (%)'],
    ...result.volatility.forecastVolatility.map((v) => [
      v.step,
      v.date,
      Number(v.garchVolAnnPct.toFixed(3)),
      Number(v.egarchVolAnnPct.toFixed(3)),
      Number(v.garchPeriodVolPct.toFixed(3)),
      Number(v.egarchPeriodVolPct.toFixed(3)),
    ]),
  ];
  const wsVol = XLSX.utils.aoa_to_sheet([volHeader, ...volParamRows, ...vfHeader]);
  XLSX.utils.book_append_sheet(wb, wsVol, 'Volatility_GARCH_EGARCH');

  // Sheet 5: Historical & In-Sample Fitted Values
  const histHeader = ['Date', 'Actual Price', 'ARIMA Fitted', 'SVR Fitted', 'GA-RNN Fitted', 'HMM Fitted', 'Kalman Predicted', 'HMM Regime'];
  const histRows = result.series.map((s, i) => [
    s.date,
    Number(s.close.toFixed(4)),
    Number((result.arima.fitted[i] ?? s.close).toFixed(4)),
    Number((result.svr.fitted[i] ?? s.close).toFixed(4)),
    Number((result.rnnGa.fitted[i] ?? s.close).toFixed(4)),
    Number((result.hmm.fitted[i] ?? s.close).toFixed(4)),
    Number((result.kalman.fitted[i] ?? s.close).toFixed(4)),
    result.hmm.stateLabels[result.hmm.historicalStates[i] ?? 1],
  ]);
  const wsHist = XLSX.utils.aoa_to_sheet([histHeader, ...histRows]);
  XLSX.utils.book_append_sheet(wb, wsHist, 'Historical_Fitted');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeSlug(result.datasetName)}_Finlytics_Report.xlsx`
  );
}

export function exportCsvReport(result: FullAnalysisResult) {
  const lines: string[] = [];
  lines.push(`# Finlytics Comparative Report,${result.datasetName}`);
  lines.push(`# Frequency,${result.frequency},Horizon,${result.horizonSteps}`);
  lines.push('');
  lines.push('SECTION: MODEL PERFORMANCE COMPARISON');
  lines.push('Rank,Model,Category,RMSE,MAE,MAPE(%),DirectionalAccuracy(%),TheilU,R2,HorizonTarget,ImpliedChange(%)');
  for (const m of result.summary.rankedModels) {
    lines.push(
      `${m.rank},"${m.name}",${m.category},${m.rmse.toFixed(4)},${m.mae.toFixed(4)},${m.mape.toFixed(3)},${m.directionalAccuracy.toFixed(2)},${m.theilU.toFixed(4)},${m.rSquared.toFixed(4)},${m.horizonEndPrice.toFixed(4)},${m.impliedChangePct.toFixed(3)}`
    );
  }
  lines.push('');
  lines.push('SECTION: HORIZON FORECAST PATH');
  lines.push('Step,Date,ARIMA,SVR,GA-RNN,HMM,Kalman,Ensemble,EnsembleLower95,EnsembleUpper95,GARCH_AnnVol(%),EGARCH_AnnVol(%)');
  result.ensemble.forecast.forEach((ef, idx) => {
    const vf = result.volatility.forecastVolatility[idx];
    lines.push(
      `${ef.step},${ef.date},${result.arima.forecast[idx].point.toFixed(4)},${result.svr.forecast[idx].point.toFixed(4)},${result.rnnGa.forecast[idx].point.toFixed(4)},${result.hmm.forecast[idx].point.toFixed(4)},${result.kalman.forecast[idx].point.toFixed(4)},${ef.point.toFixed(4)},${ef.lower95.toFixed(4)},${ef.upper95.toFixed(4)},${vf.garchVolAnnPct.toFixed(3)},${vf.egarchVolAnnPct.toFixed(3)}`
    );
  });
  lines.push('');
  lines.push(`"CONCLUSIVE SUGGESTION","${result.summary.conclusiveSuggestion.replace(/"/g, '""')}"`);

  triggerDownload(
    new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }),
    `${safeSlug(result.datasetName)}_Forecast_Comparison.csv`
  );
}

export function exportAcademicHtmlReport(result: FullAnalysisResult) {
  const rowsHtml = result.summary.rankedModels
    .map(
      (m) => `<tr>
        <td>${m.rank}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.category}</td>
        <td class="num">${m.rmse.toFixed(4)}</td>
        <td class="num">${m.mae.toFixed(4)}</td>
        <td class="num">${m.mape.toFixed(2)}%</td>
        <td class="num">${m.directionalAccuracy.toFixed(1)}%</td>
        <td class="num">${m.theilU.toFixed(4)}</td>
        <td class="num">${m.horizonEndPrice.toFixed(2)}</td>
        <td class="num">${m.impliedChangePct >= 0 ? '+' : ''}${m.impliedChangePct.toFixed(2)}%</td>
      </tr>`
    )
    .join('');

  const forecastHtml = result.ensemble.forecast
    .map(
      (ef, i) => `<tr>
        <td class="num">${ef.step}</td>
        <td>${ef.date}</td>
        <td class="num">${result.arima.forecast[i].point.toFixed(2)}</td>
        <td class="num">${result.svr.forecast[i].point.toFixed(2)}</td>
        <td class="num">${result.rnnGa.forecast[i].point.toFixed(2)}</td>
        <td class="num">${result.hmm.forecast[i].point.toFixed(2)}</td>
        <td class="num">${result.kalman.forecast[i].point.toFixed(2)}</td>
        <td class="num"><strong>${ef.point.toFixed(2)}</strong></td>
        <td class="num">${result.volatility.forecastVolatility[i].garchVolAnnPct.toFixed(2)}%</td>
        <td class="num">${result.volatility.forecastVolatility[i].egarchVolAnnPct.toFixed(2)}%</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Finlytics Academic Analysis — ${result.datasetName}</title>
<style>
  body { font-family: 'Georgia', serif; color: #0f172a; max-width: 980px; margin: 40px auto; padding: 0 24px; line-height: 1.6; }
  h1, h2, h3 { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; }
  h1 { font-size: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
  h2 { font-size: 16px; margin-top: 28px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #475569; margin-bottom: 24px; }
  .box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 16px; border-radius: 6px; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; margin: 14px 0; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; }
  th { background: #f1f5f9; font-weight: 600; }
  .num { text-align: right; font-family: 'Courier New', monospace; }
  ul { padding-left: 20px; }
  li { margin-bottom: 6px; }
</style>
</head>
<body>
  <h1>Financial Time-Series Econometric &amp; Machine Learning Report</h1>
  <div class="meta">
    Dataset: <strong>${result.datasetName}</strong> · Observations: ${result.stats.count} (${result.stats.startDate} to ${result.stats.endDate}) ·
    Frequency: ${result.frequency.toUpperCase()} · Horizon: ${result.summary.horizonLabel} · Generated: ${result.generatedAtIso.slice(0, 19).replace('T', ' ')} UTC
  </div>

  <h2>1. Comparative Executive Summary</h2>
  <p>${result.summary.executiveNarrative}</p>
  <div class="box">
    <strong>Conclusive Suggestion (${result.summary.marketBias} · ${result.summary.confidenceGrade} Conviction):</strong><br/>
    ${result.summary.conclusiveSuggestion}
  </div>

  <h2>2. Out-of-Sample Model Performance Comparison (Holdout n=${result.holdoutSize})</h2>
  <table>
    <thead>
      <tr>
        <th>Rank</th><th>Model</th><th>Methodology</th><th class="num">RMSE</th><th class="num">MAE</th>
        <th class="num">MAPE</th><th class="num">Dir. Acc.</th><th class="num">Theil's U</th><th class="num">Target</th><th class="num">Chg %</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <h2>3. Multi-Methodology Forecast Schedule (${result.horizonSteps} Steps)</h2>
  <table>
    <thead>
      <tr>
        <th class="num">Step</th><th>Period</th><th class="num">ARIMA</th><th class="num">SVR</th><th class="num">GA-RNN</th>
        <th class="num">HMM</th><th class="num">Kalman</th><th class="num">Ensemble</th><th class="num">GARCH Vol</th><th class="num">EGARCH Vol</th>
      </tr>
    </thead>
    <tbody>${forecastHtml}</tbody>
  </table>

  <h2>4. Volatility Modeling: AR(2)-GARCH(1,1) vs AR(2)-EGARCH(1,1)</h2>
  <p>${result.volatility.trendAssessmentSummary}</p>
  <p>${result.volatility.leverageCommentary}</p>

  <h2>5. Methodology Findings &amp; Statistical Caveats</h2>
  <ul>${result.summary.methodologyFindings.map((f) => `<li>${f}</li>`).join('')}</ul>
  <h3>Academic &amp; Statistical Caveats</h3>
  <ul>${result.summary.academicCaveats.map((c) => `<li>${c}</li>`).join('')}</ul>
</body>
</html>`;

  triggerDownload(
    new Blob([html], { type: 'text/html;charset=utf-8;' }),
    `${safeSlug(result.datasetName)}_Academic_Brief.html`
  );
}
