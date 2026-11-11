import React from 'react';
import { RefreshCw, Upload, FileText, CheckCircle2 } from 'lucide-react';
import { ParsedDataset, SeriesFrequency } from '../types/timeseries';

interface SidebarControlsProps {
  dataset: ParsedDataset;
  dateCol: string;
  priceCol: string;
  frequency: SeriesFrequency;
  holdoutRatio: number;
  isComputing: boolean;
  onDateColChange: (col: string) => void;
  onPriceColChange: (col: string) => void;
  onFrequencyChange: (freq: SeriesFrequency) => void;
  onHoldoutRatioChange: (ratio: number) => void;
  onRerunAnalysis: () => void;
  onOpenUpload: () => void;
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  dataset,
  dateCol,
  priceCol,
  frequency,
  holdoutRatio,
  isComputing,
  onDateColChange,
  onPriceColChange,
  onFrequencyChange,
  onHoldoutRatioChange,
  onRerunAnalysis,
  onOpenUpload,
}) => {
  const horizonText = frequency === 'monthly' ? '3 Months Close' : '10 Trading Days';

  return (
    <aside className="no-print w-full lg:w-[280px] shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-5 space-y-6">
      {/* Uploaded File Header */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Uploaded File
          </h2>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" />
            Loaded
          </span>
        </div>
        
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 truncate" title={dataset.fileName}>
                {dataset.fileName}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Sheet: {dataset.sheetName}
              </div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
            <span className="font-mono tabular-nums">{dataset.series.length} observations</span>
            <span>{frequency === 'monthly' ? 'Monthly' : 'Daily'}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenUpload}
          className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shadow-xs"
        >
          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
          Upload Another File
        </button>
      </div>

      {/* Schema & Column Mapping */}
      <div className="border-t border-slate-100 pt-5 space-y-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Column Mapping
        </div>

        <div>
          <label htmlFor="date-col-select" className="block text-xs font-medium text-slate-700 mb-1">
            Date / Period Column
          </label>
          <select
            id="date-col-select"
            value={dateCol}
            onChange={(e) => onDateColChange(e.target.value)}
            className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {dataset.headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="price-col-select" className="block text-xs font-medium text-slate-700 mb-1">
            Target Price / Close Column
          </label>
          <select
            id="price-col-select"
            value={priceCol}
            onChange={(e) => onPriceColChange(e.target.value)}
            className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {dataset.headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-700 mb-1.5">
            Frequency &amp; Forecast Horizon
          </span>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onFrequencyChange('daily')}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                frequency === 'daily'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily · 10D
            </button>
            <button
              type="button"
              onClick={() => onFrequencyChange('monthly')}
              className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                frequency === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly · 3M
            </button>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Target Horizon: <span className="font-medium text-slate-700">{horizonText}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-700">Holdout Validation Split</span>
            <span className="font-mono tabular-nums text-slate-900">{Math.round(holdoutRatio * 100)}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={25}
            step={5}
            value={Math.round(holdoutRatio * 100)}
            onChange={(e) => onHoldoutRatioChange(Number(e.target.value) / 100)}
            className="w-full accent-blue-700"
            aria-label="Holdout Validation Split Percentage"
          />
        </div>

        <button
          type="button"
          disabled={isComputing}
          onClick={onRerunAnalysis}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isComputing ? 'animate-spin' : ''}`} aria-hidden="true" />
          {isComputing ? 'Calculating Models...' : 'Re-run Analysis'}
        </button>
      </div>

      <div className="border-t border-slate-100 pt-4 text-xs text-slate-500 space-y-1">
        <div className="font-medium text-slate-700">Models in Pipeline</div>
        <p className="leading-relaxed text-[11px]">
          ARIMA · SVR (RBF) · GA-RNN · 3-State HMM · Kalman Filter · AR(2)-GARCH &amp; EGARCH
        </p>
      </div>
    </aside>
  );
};
