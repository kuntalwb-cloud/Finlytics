import React from 'react';
import { Download, FileSpreadsheet, FileText, Printer, BookOpen, Layers } from 'lucide-react';
import { FullAnalysisResult } from '../types/timeseries';
import {
  exportAcademicHtmlReport,
  exportCsvReport,
  exportExcelWorkbook,
} from '../utils/exportReports';
import {
  downloadCombinedReportPdf,
  downloadCombinedReportWord,
  downloadModelReportPdf,
  downloadModelReportWord,
} from '../utils/documentExportService';
import { generateCombinedConclusiveReport } from '../utils/academicResearchGenerator';
import { BarDiagnosticChart } from './InteractiveCharts';

interface SummaryReportViewProps {
  result: FullAnalysisResult;
}

export const SummaryReportView: React.FC<SummaryReportViewProps> = ({ result }) => {
  const { summary, volatility, stats } = result;
  const combinedReport = generateCombinedConclusiveReport(result);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Download Centers */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Comprehensive Research Synthesis &amp; Export Center
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{result.datasetName}</span>
            <span aria-hidden="true">·</span>
            <span>{summary.horizonLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-blue-700">Conclusive Monograph: ~{combinedReport.wordCount} words</span>
            <span aria-hidden="true">·</span>
            <span>Generated {result.generatedAtIso.slice(0, 10)}</span>
          </div>
        </div>

        {/* Global Export Actions */}
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadCombinedReportPdf(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Download 2000W+ Report (PDF)
          </button>
          <button
            type="button"
            onClick={() => downloadCombinedReportWord(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors whitespace-nowrap shadow-xs cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            Download 2000W+ Report (Word .doc)
          </button>
          <button
            type="button"
            onClick={() => exportExcelWorkbook(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            Excel Workbook (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => exportCsvReport(result)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
            CSV Data Matrix
          </button>
        </div>
      </div>

      {/* Individual Model Research Download Hub */}
      <section className="bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 border border-blue-200/80 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-700" />
            <h2 className="font-display text-sm font-bold text-slate-900">
              Individual Methodology Academic Research Papers (500+ Words Each with Mathematical Logic)
            </h2>
          </div>
          <span className="text-xs text-blue-700 font-semibold hidden sm:inline">
            Direct PDF &amp; Word Format Downloads
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Download self-contained academic papers detailing the theoretical equations, state-space formulations, parameter derivations, stationarity proofs, and empirical diagnostics for each specific model:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {[
            { id: 'arima', label: 'ARIMA(p,d,q) Box-Jenkins Paper', icon: Layers },
            { id: 'svr', label: 'Non-Linear SVR-RBF Formulation', icon: Layers },
            { id: 'rnn_ga', label: 'Genetic Algorithm RNN Monograph', icon: Layers },
            { id: 'hmm', label: '3-State Gaussian HMM Paper', icon: Layers },
            { id: 'kalman', label: 'Local Linear Kalman State-Space', icon: Layers },
            { id: 'volatility', label: 'AR(2)-GARCH vs EGARCH Volatility', icon: Layers },
          ].map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col justify-between gap-2 shadow-xs">
              <div className="text-xs font-semibold text-slate-900 truncate" title={item.label}>
                {item.label}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadModelReportPdf(item.id as any, result)}
                  className="flex-1 text-[11px] font-medium py-1 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors text-center cursor-pointer"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadModelReportWord(item.id as any, result)}
                  className="flex-1 text-[11px] font-medium py-1 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded transition-colors text-center cursor-pointer"
                >
                  Word (.doc)
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2000+ Words Combined Conclusive Trend Analysis Monograph View */}
      <section className="print-break-inside-avoid bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded text-blue-700 text-[11px] font-semibold mb-2">
              Comprehensive Research Monograph (~{combinedReport.wordCount} Words)
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 leading-snug">
              {combinedReport.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadCombinedReportPdf(result)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3 h-3" />
              Download PDF
            </button>
            <button
              type="button"
              onClick={() => downloadCombinedReportWord(result)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg transition-colors cursor-pointer"
            >
              <FileText className="w-3 h-3" />
              Download Word
            </button>
          </div>
        </div>

        {/* Monograph Content Sections */}
        <div className="space-y-6 text-sm text-slate-700 leading-relaxed">
          {combinedReport.sections.map((sec, sIdx) => (
            <div key={sIdx} className="space-y-3">
              <h3 className="font-display text-base font-bold text-slate-900 text-blue-900 border-b border-slate-100 pb-1.5">
                {sec.heading}
              </h3>
              {sec.paragraphs.map((p, pIdx) => (
                <p key={pIdx} className="text-justify leading-relaxed">
                  {p}
                </p>
              ))}

              {sec.tableData && sec.tableData.length > 0 && (
                <div className="overflow-x-auto my-3 border border-slate-200 rounded-lg">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                        {sec.tableData[0].map((h, i) => (
                          <th key={i} className={`py-2 px-3 font-semibold ${i >= 3 ? 'text-right' : 'text-left'}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {sec.tableData.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className={`py-2 px-3 tabular-nums ${cIdx >= 3 ? 'text-right' : 'text-left font-sans'}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Visual Diagnostic Error Comparison Strip */}
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
    </div>
  );
};
