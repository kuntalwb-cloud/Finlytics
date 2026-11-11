import React from 'react';
import { Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { FullAnalysisResult } from '../types/timeseries';
import {
  exportAcademicHtmlReport,
  exportCsvReport,
  exportExcelWorkbook,
} from '../utils/exportReports';
import { BarDiagnosticChart } from './InteractiveCharts';

interface SummaryReportViewProps {
  result: FullAnalysisResult;
}

export const SummaryReportView: React.FC<SummaryReportViewProps> = ({ result }) => {
  const { summary, volatility, stats } = result;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Comparative Summarize Statement &amp; Export Center
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{result.datasetName}</span>
            <span aria-hidden="true">·</span>
            <span>{summary.horizonLabel}</span>
            <span aria-hidden="true">·</span>
            <span>Generated {result.generatedAtIso.slice(0, 10)}</span>
          </div>
        </div>

        {/* Export Actions */}
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportExcelWorkbook(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            Export Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => exportCsvReport(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            CSV Matrix
          </button>
          <button
            type="button"
            onClick={() => exportAcademicHtmlReport(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Academic Brief (.html)
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Executive Narrative & Conclusive Suggestion */}
      <section className="print-break-inside-avoid bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900 mb-2">
            1. Comparative Executive Summarize Statement
          </h2>
          <p className="text-sm text-slate-700 leading-relaxed">{summary.executiveNarrative}</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
              Conclusive Analytical Suggestion
            </span>
            <span className="text-xs font-mono font-semibold text-blue-700">
              {summary.marketBias} · {summary.confidenceGrade} Conviction
            </span>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{summary.conclusiveSuggestion}</p>
        </div>
      </section>

      {/* Visual Error Comparison + Target Dispersion */}
      <div className="print-break-inside-avoid grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Out-of-Sample RMSE Comparison Across Models (Lower is Better)
          </h3>
          <BarDiagnosticChart
            values={summary.rankedModels.map((m) => m.rmse)}
            labels={summary.rankedModels.map((m) =>
              m.id === 'rnn_ga' ? 'GA-RNN' : m.id === 'ensemble' ? 'Ens' : m.id.toUpperCase()
            )}
            barColor="#1d4ed8"
            height={200}
          />
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Directional Accuracy (%) Across Models (Higher is Better)
          </h3>
          <BarDiagnosticChart
            values={summary.rankedModels.map((m) => m.directionalAccuracy)}
            labels={summary.rankedModels.map((m) =>
              m.id === 'rnn_ga' ? 'GA-RNN' : m.id === 'ensemble' ? 'Ens' : m.id.toUpperCase()
            )}
            barColor="#0f766e"
            thresholdLine={50}
            height={200}
          />
        </section>
      </div>

      {/* Methodology Findings & Academic Caveats */}
      <div className="print-break-inside-avoid grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            2. Cross-Methodology Findings
          </h2>
          <ul className="space-y-2.5 text-xs text-slate-700 leading-relaxed list-disc pl-4">
            {summary.methodologyFindings.map((finding, idx) => (
              <li key={idx}>{finding}</li>
            ))}
          </ul>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="font-display text-base font-semibold text-slate-900">
            3. Statistical Diagnostics &amp; Academic Caveats
          </h2>
          <div className="grid grid-cols-2 gap-2.5 text-xs pb-1">
            <div className="p-2.5 bg-slate-50 rounded-md">
              <div className="text-slate-500">Jarque-Bera Normality</div>
              <div className="font-mono font-semibold text-slate-900">
                JB={stats.jarqueBeraStat.toFixed(1)} (p={stats.jarqueBeraPValue.toFixed(4)})
              </div>
            </div>
            <div className="p-2.5 bg-slate-50 rounded-md">
              <div className="text-slate-500">ADF Unit Root (Level)</div>
              <div className="font-mono font-semibold text-slate-900">
                t={stats.adfStatistic.toFixed(2)} ({stats.isStationaryLevel ? 'Stationary' : 'I(1) Diff Req.'})
              </div>
            </div>
          </div>
          <ul className="space-y-2 text-xs text-slate-700 leading-relaxed list-disc pl-4">
            {summary.academicCaveats.map((caveat, idx) => (
              <li key={idx}>{caveat}</li>
            ))}
          </ul>
        </section>
      </div>

      {/* Consolidated Matrix for Print / Report */}
      <section className="print-break-inside-avoid bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-slate-900">
            4. Consolidated Evaluation &amp; Terminal Forecast Summary
          </h2>
          <span className="text-xs text-slate-500 font-mono">
            Vol Model: {volatility.preferredVolatilityModel}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 text-left font-semibold">Rank</th>
                <th className="py-2.5 px-4 text-left font-semibold">Model</th>
                <th className="py-2.5 px-4 text-right font-semibold">RMSE</th>
                <th className="py-2.5 px-4 text-right font-semibold">MAE</th>
                <th className="py-2.5 px-4 text-right font-semibold">MAPE</th>
                <th className="py-2.5 px-4 text-right font-semibold">Dir. Acc.</th>
                <th className="py-2.5 px-4 text-right font-semibold">Theil&apos;s U</th>
                <th className="py-2.5 px-4 text-right font-semibold">Horizon Target</th>
                <th className="py-2.5 px-4 text-right font-semibold">Implied Chg</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.rankedModels.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 px-4 font-mono tabular-nums font-semibold">#{m.rank}</td>
                  <td className="py-2 px-4 font-medium text-slate-900">{m.name}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums">{m.rmse.toFixed(4)}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums">{m.mae.toFixed(4)}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums">{m.mape.toFixed(2)}%</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums">{m.directionalAccuracy.toFixed(1)}%</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums">{m.theilU.toFixed(4)}</td>
                  <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold">
                    {m.horizonEndPrice.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 px-4 text-right font-mono tabular-nums font-semibold ${
                      m.impliedChangePct >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {m.impliedChangePct >= 0 ? '+' : ''}
                    {m.impliedChangePct.toFixed(2)}%
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
