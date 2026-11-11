import React, { useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X, Database } from 'lucide-react';
import { ParsedDataset } from '../types/timeseries';
import { parseFinancialFile, loadSampleDataset, SampleDatasetKey } from '../utils/dataParser';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDatasetLoaded: (dataset: ParsedDataset) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onDatasetLoaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const processFile = async (file: File) => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const parsed = await parseFinancialFile(file);
      onDatasetLoaded(parsed);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to parse the selected file.');
    } finally {
      setIsLoading(false);
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

  const handleLoadSample = (key: SampleDatasetKey) => {
    try {
      const sample = loadSampleDataset(key);
      onDatasetLoaded(sample);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sample dataset.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 id="upload-modal-title" className="font-display text-lg font-bold text-slate-900">
            Upload or Load Financial Time-Series
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md"
            aria-label="Close upload dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            isDragging ? 'border-blue-600 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400 bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          {isLoading ? (
            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          ) : (
            <FileSpreadsheet className="w-8 h-8 text-slate-500 mx-auto mb-2" aria-hidden="true" />
          )}
          <div className="text-sm font-semibold text-slate-900">
            {isLoading ? 'Parsing workbook & calibrating models...' : 'Drop Excel (.xlsx, .xls) or CSV file here'}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Or click to browse local spreadsheets. Minimum 8 chronological observations required.
          </p>
          <div className="mt-3">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 rounded-lg">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              {isLoading ? 'Processing...' : 'Browse File'}
            </span>
          </div>
        </div>

        {/* Built-in Sample Datasets */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-blue-700" />
            Or instantly load built-in professional benchmark datasets:
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleLoadSample('daily_equity')}
              className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer text-center"
            >
              Daily Equity (252D)
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('monthly_index')}
              className="px-3 py-2 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer text-center"
            >
              Monthly Index (72M)
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('daily_volatile')}
              className="px-3 py-2 text-xs font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors cursor-pointer text-center"
            >
              High-Vol Equity (252D)
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg">
            {errorMsg}
          </div>
        )}

        <div className="text-xs text-slate-500 space-y-1 border-t border-slate-100 pt-3">
          <div className="font-semibold text-slate-700">Automatic Detection Rules</div>
          <p>
            Date and Close/Price columns are automatically detected and can be remapped in the sidebar. Daily series forecast 10 trading days ahead; monthly series forecast 3 months close ahead.
          </p>
        </div>
      </div>
    </div>
  );
};
