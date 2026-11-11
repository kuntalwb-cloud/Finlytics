import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  TrendingUp,
  Cpu,
  BarChart3,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  TableProperties
} from 'lucide-react';
import { ParsedDataset } from '../types/timeseries';
import { parseFinancialFile } from '../utils/dataParser';

interface LandingUploadPageProps {
  onDatasetLoaded: (dataset: ParsedDataset) => void;
  isLoading: boolean;
}

export const LandingUploadPage: React.FC<LandingUploadPageProps> = ({
  onDatasetLoaded,
  isLoading,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processFile = async (file: File) => {
    setErrorMsg(null);
    try {
      const parsed = await parseFinancialFile(file);
      onDatasetLoaded(parsed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse the selected file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  return (
    <div className="flex-1 max-w-[1240px] w-full mx-auto px-6 py-10 lg:py-16 space-y-12">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200/60">
          <TrendingUp className="w-3.5 h-3.5" />
          Financial Econometrics &amp; Machine Learning Suite
        </div>

        <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
          Upload financial series to begin econometric analysis
        </h1>

        <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Finlytics takes your custom Excel or CSV spreadsheets and executes multi-methodology time-series predictions (ARIMA, SVR, GA-RNN, HMM, Kalman Filter) alongside AR(2)-GARCH/EGARCH volatility modeling.
        </p>
      </div>

      {/* Main Drag-and-Drop Upload Card */}
      <div className="max-w-2xl mx-auto">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all bg-white shadow-sm hover:shadow-md ${
            isDragging
              ? 'border-blue-600 bg-blue-50/40 ring-4 ring-blue-100'
              : 'border-slate-300 hover:border-blue-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto mb-4 border border-blue-100 shadow-xs">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <div className="text-lg font-bold text-slate-900">
            {isLoading ? 'Reading & running econometric models...' : 'Drop your Excel (.xlsx, .xls) or CSV here'}
          </div>

          <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
            Click to browse files. Supports daily closing stock prices, monthly macroeconomic indices, or custom OHLCV records (minimum 25 periods).
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-xl transition-all shadow-xs"
            >
              <Upload className="w-4 h-4" />
              {isLoading ? 'Processing Pipeline...' : 'Select File from Computer'}
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-center gap-6 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
              Excel &amp; CSV Auto-Detection
            </span>
            <span className="flex items-center gap-1.5">
              <TableProperties className="w-3.5 h-3.5 text-blue-600" />
              Daily (10D) &amp; Monthly (3M)
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              Client-Side Fast Processing
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-4 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl">
            {errorMsg}
          </div>
        )}
      </div>

      {/* Feature & Methodology Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <TrendingUp className="w-5 h-5" />
          </div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            1. Multi-Model Forecasting
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Runs 5 independent paradigms simultaneously: <strong>ARIMA</strong> with ADF unit-root differencing, <strong>SVR (RBF)</strong> kernel regressions, <strong>GA-RNN</strong> with genetic algorithm optimization, <strong>3-State HMM</strong> regime switching, and <strong>Kalman Filter</strong> state-space smoothing.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            2. Volatility Trend Reliability
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Estimates <strong>AR(2)-GARCH(1,1)</strong> alongside <strong>AR(2)-EGARCH(1,1)</strong> via QMLE to evaluate asymmetric downside leverage, News Impact Curves, volatility clustering persistence, and 95%/99% Value-at-Risk.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-3">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <BarChart3 className="w-5 h-5" />
          </div>
          <h2 className="font-display text-base font-semibold text-slate-900">
            3. Comparative &amp; Exportable
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Ranks all models by out-of-sample holdout RMSE, MAE, and directional accuracy. Provides an executive summarize statement, conclusive suggestions, and one-click multi-sheet <strong>Excel (.xlsx)</strong>, <strong>CSV</strong>, and <strong>Academic HTML</strong> exports.
          </p>
        </div>
      </div>
    </div>
  );
};
