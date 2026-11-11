import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { FullAnalysisResult, ParsedDataset } from '../types/timeseries';

interface DataExplorerViewProps {
  dataset: ParsedDataset;
  result: FullAnalysisResult;
  onOpenUpload: () => void;
}

export const DataExplorerView: React.FC<DataExplorerViewProps> = ({
  dataset,
  result,
  onOpenUpload,
}) => {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const reversed = [...result.series].reverse();
    if (!q) return reversed;
    return reversed.filter(
      (pt) => pt.date.toLowerCase().includes(q) || pt.close.toFixed(2).includes(q)
    );
  }, [result.series, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const { stats } = result;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Dataset Explorer &amp; Distributional Diagnostics
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{dataset.fileName}</span>
            <span aria-hidden="true">·</span>
            <span>Sheet: {dataset.sheetName}</span>
            <span aria-hidden="true">·</span>
            <span>{stats.startDate} to {stats.endDate}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenUpload}
          className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap self-start"
        >
          Upload New Excel / CSV
        </button>
      </div>

      {/* Descriptive & Econometric Summary Grid */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-display text-sm font-semibold text-slate-900 mb-3">
          Descriptive Statistics &amp; Stationarity Tests
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {[
            { label: 'Observations', val: String(stats.count) },
            { label: 'Mean Price', val: stats.mean.toFixed(2) },
            { label: 'Std. Deviation', val: stats.stdDev.toFixed(2) },
            { label: 'Min / Max', val: `${stats.min.toFixed(2)} / ${stats.max.toFixed(2)}` },
            { label: 'Total Return', val: `${stats.totalReturnPct >= 0 ? '+' : ''}${stats.totalReturnPct.toFixed(2)}%` },
            { label: 'Max Drawdown', val: `-${stats.maxDrawdownPct.toFixed(2)}%` },
            { label: 'Ann. Return', val: `${stats.annualizedReturnPct >= 0 ? '+' : ''}${stats.annualizedReturnPct.toFixed(2)}%` },
            { label: 'Ann. Volatility', val: `${stats.annualizedVolPct.toFixed(2)}%` },
            { label: 'Return/Vol Ratio', val: stats.sharpeApprox.toFixed(2) },
            { label: 'Return Skewness', val: stats.skewness.toFixed(3) },
            { label: 'Excess Kurtosis', val: stats.excessKurtosis.toFixed(3) },
            {
              label: 'ADF Level Stat',
              val: `${stats.adfStatistic.toFixed(2)} (${stats.isStationaryLevel ? 'I(0)' : 'Non-Stat.'})`,
            },
          ].map((item) => (
            <div key={item.label} className="p-3 bg-slate-50 rounded-lg">
              <div className="text-slate-500">{item.label}</div>
              <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">{item.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Searchable Series Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Parsed Time-Series Ledger ({filtered.length} rows)
          </h2>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Filter by date or price..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="py-2.5 px-4 text-left font-semibold">#</th>
                <th className="py-2.5 px-4 text-left font-semibold">Date / Period</th>
                <th className="py-2.5 px-4 text-right font-semibold">Target Close</th>
                <th className="py-2.5 px-4 text-right font-semibold">Open</th>
                <th className="py-2.5 px-4 text-right font-semibold">High</th>
                <th className="py-2.5 px-4 text-right font-semibold">Low</th>
                <th className="py-2.5 px-4 text-right font-semibold">Volume</th>
                <th className="py-2.5 px-4 text-left font-semibold">HMM Regime</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((row) => {
                const st = result.hmm.historicalStates[row.index] ?? 1;
                const stName = ['Bear', 'Neutral', 'Bull'][st];
                return (
                  <tr key={row.index} className="hover:bg-slate-50">
                    <td className="py-2 px-4 font-mono tabular-nums text-slate-400">{row.index + 1}</td>
                    <td className="py-2 px-4 font-mono tabular-nums text-slate-900">{row.date}</td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {row.close.toFixed(2)}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-600">
                      {row.open !== undefined ? row.open.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-600">
                      {row.high !== undefined ? row.high.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-600">
                      {row.low !== undefined ? row.low.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono tabular-nums text-slate-600">
                      {row.volume !== undefined ? row.volume.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 px-4 text-slate-700">{stName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Page {safePage + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-3 py-1 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
