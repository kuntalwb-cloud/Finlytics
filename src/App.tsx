import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, ArrowUpRight, TrendingUp, Cpu, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { DataExplorerView } from './components/DataExplorerView';
import { ModelDetailView } from './components/ModelDetailView';
import { OverviewComparison } from './components/OverviewComparison';
import { SidebarControls } from './components/SidebarControls';
import { SummaryReportView } from './components/SummaryReportView';
import { TopBar, WorkspaceTab } from './components/TopBar';
import { UploadModal } from './components/UploadModal';
import { VolatilityLabView } from './components/VolatilityLabView';
import { WelcomeScreen } from './components/WelcomeScreen';
import { runFullAnalysisPipeline } from './engine/pipeline';
import { FullAnalysisResult, ModelId, ParsedDataset, SeriesFrequency } from './types/timeseries';
import { buildSeriesFromRows, parseFinancialFile, loadSampleDataset } from './utils/dataParser';

export default function App() {
  // Show welcome screen initially until user clicks "Enter Workspace"
  const [showWelcome, setShowWelcome] = useState<boolean>(true);

  const initialSample = loadSampleDataset('daily_equity');
  const initialResult = runFullAnalysisPipeline(initialSample.fileName, initialSample.series, 'daily', 0.15);

  const [dataset, setDataset] = useState<ParsedDataset | null>(initialSample);
  const [dateCol, setDateCol] = useState<string>(initialSample.detectedDateCol);
  const [priceCol, setPriceCol] = useState<string>(initialSample.detectedPriceCol);
  const [frequency, setFrequency] = useState<SeriesFrequency>(initialSample.detectedFrequency);
  const [holdoutRatio, setHoldoutRatio] = useState<number>(0.15);

  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(initialResult);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [selectedModel, setSelectedModel] = useState<Exclude<ModelId, 'ensemble'>>('arima');
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [isLandingDrag, setIsLandingDrag] = useState<boolean>(false);
  const directFileInputRef = useRef<HTMLInputElement>(null);

  const executePipeline = useCallback(
    (
      ds: ParsedDataset,
      dCol: string,
      pCol: string,
      freq: SeriesFrequency,
      ratio: number
    ) => {
      setIsComputing(true);
      setPipelineError(null);
      window.setTimeout(() => {
        try {
          const { series } = buildSeriesFromRows(ds.headers, ds.rows, dCol, pCol);
          if (series.length < 8) {
            throw new Error(
              `Column "${pCol}" yielded only ${series.length} valid positive numeric rows. At least 8 chronological records are required for econometric and ML estimation.`
            );
          }
          const updatedDs: ParsedDataset = { ...ds, series };
          setDataset(updatedDs);
          const res = runFullAnalysisPipeline(ds.fileName, series, freq, ratio);
          setAnalysisResult(res);
        } catch (err) {
          setPipelineError(err instanceof Error ? err.message : 'Analysis pipeline calculation failed.');
        } finally {
          setIsComputing(false);
        }
      }, 20);
    },
    []
  );

  const handleProcessRawFile = async (file: File) => {
    setIsComputing(true);
    setPipelineError(null);
    try {
      const parsed = await parseFinancialFile(file);
      setDateCol(parsed.detectedDateCol);
      setPriceCol(parsed.detectedPriceCol);
      setFrequency(parsed.detectedFrequency);
      setDataset(parsed);
      executePipeline(parsed, parsed.detectedDateCol, parsed.detectedPriceCol, parsed.detectedFrequency, holdoutRatio);
      setActiveTab('overview');
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'Unable to parse the uploaded file.');
      setIsComputing(false);
    }
  };

  const handleDatasetLoaded = (newDs: ParsedDataset) => {
    setDateCol(newDs.detectedDateCol);
    setPriceCol(newDs.detectedPriceCol);
    setFrequency(newDs.detectedFrequency);
    setDataset(newDs);
    executePipeline(newDs, newDs.detectedDateCol, newDs.detectedPriceCol, newDs.detectedFrequency, holdoutRatio);
    setActiveTab('overview');
  };

  const handleFrequencyChange = (nextFreq: SeriesFrequency) => {
    if (!dataset) return;
    setFrequency(nextFreq);
    executePipeline(dataset, dateCol, priceCol, nextFreq, holdoutRatio);
  };

  const handleDateColChange = (col: string) => {
    if (!dataset) return;
    setDateCol(col);
    executePipeline(dataset, col, priceCol, frequency, holdoutRatio);
  };

  const handlePriceColChange = (col: string) => {
    if (!dataset) return;
    setPriceCol(col);
    executePipeline(dataset, dateCol, col, frequency, holdoutRatio);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isUploadOpen) setIsUploadOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isUploadOpen]);

  // Dedicated welcome page; transitions to main workbench only on Enter Workspace click
  if (showWelcome) {
    return <WelcomeScreen onEnter={() => setShowWelcome(false)} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onUploadClick={() => setIsUploadOpen(true)}
        hasData={dataset !== null && analysisResult !== null}
      />

      {/* When no file is uploaded yet, show clean Upload / Get Started view */}
      {!dataset || !analysisResult ? (
        <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-12 flex flex-col justify-center">
          <div className="max-w-3xl mx-auto w-full text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full border border-blue-200/60">
              <TrendingUp className="w-3.5 h-3.5" />
              Financial Time-Series Econometrics &amp; Machine Learning
            </div>

            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900">
              Analyze your financial series with multi-model econometrics &amp; ML
            </h1>

            <p className="text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Upload your custom Excel (<span className="font-mono text-slate-800">.xlsx</span>, <span className="font-mono text-slate-800">.xls</span>) or CSV file. Finlytics automatically parses your columns, detects series frequency (daily 10-day vs. monthly 3-month forecast), and runs complete ARIMA, SVR, GA-RNN, 3-State HMM, Kalman Filter, and AR(2)-GARCH/EGARCH volatility models.
            </p>

            {/* Prominent Error Banner if file upload or calculation errored */}
            {pipelineError && (
              <div className="p-4 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between gap-3 text-left shadow-xs">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-red-900 mb-0.5">Upload / Analysis Issue Detected</div>
                    <div>{pipelineError}</div>
                    <div className="mt-1 text-[11px] text-red-700">
                      Tip: Ensure your sheet contains at least 8 observations with a date/period and price/close column.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPipelineError(null)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-red-700 bg-red-100 hover:bg-red-200 rounded-md cursor-pointer shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Direct Drag & Drop or Click Upload Box */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsLandingDrag(true);
              }}
              onDragLeave={() => setIsLandingDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsLandingDrag(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleProcessRawFile(file);
              }}
              onClick={() => directFileInputRef.current?.click()}
              className={`cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
                isLandingDrag
                  ? 'border-blue-600 bg-blue-50/70 shadow-md scale-[1.01]'
                  : 'border-slate-300 hover:border-blue-500 bg-white hover:bg-slate-50/80 shadow-sm'
              }`}
            >
              <input
                ref={directFileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleProcessRawFile(file);
                }}
                className="hidden"
              />
              <FileSpreadsheet className="w-10 h-10 text-blue-700 mx-auto mb-3" aria-hidden="true" />
              <div className="text-base font-semibold text-slate-900">
                Drop your Excel (.xlsx, .xls) or CSV sheet here
              </div>
              <p className="mt-1.5 text-xs text-slate-500 max-w-md mx-auto">
                Or click to browse files from your computer. Supports daily stock prices, monthly macroeconomic series, and custom OHLCV data (minimum 8 observations).
              </p>
              <div className="mt-4">
                <span className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-all shadow-xs">
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  Select Excel / CSV File
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </div>
            </div>

            {/* Methodology Showcase Grid */}
            <div className="pt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center mb-3">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="font-display text-sm font-semibold text-slate-900 mb-1">
                  Separate Forecasting Engines
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ARIMA with ADF differencing, Support Vector Regression (RBF), Genetic Algorithm RNN, 3-State Gaussian HMM, and Local Linear Kalman Filter.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                  <Cpu className="w-4 h-4" />
                </div>
                <h3 className="font-display text-sm font-semibold text-slate-900 mb-1">
                  AR(2)-GARCH &amp; EGARCH
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Conditional volatility modeling with QMLE estimation, News Impact Curves, asymmetric leverage detection, and 95%/99% VaR.
                </p>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center mb-3">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <h3 className="font-display text-sm font-semibold text-slate-900 mb-1">
                  Comparative &amp; Exportable
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Cross-model RMSE/MAE/MAPE rankings, executive summarize statements, conclusive recommendations, and multi-sheet Excel/CSV/HTML exports.
                </p>
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* When dataset is uploaded, show full workbench */
        <div className="flex-1 max-w-[1440px] w-full mx-auto flex flex-col lg:flex-row">
          <SidebarControls
            dataset={dataset}
            dateCol={dateCol}
            priceCol={priceCol}
            frequency={frequency}
            holdoutRatio={holdoutRatio}
            isComputing={isComputing}
            onDateColChange={handleDateColChange}
            onPriceColChange={handlePriceColChange}
            onFrequencyChange={handleFrequencyChange}
            onHoldoutRatioChange={setHoldoutRatio}
            onRerunAnalysis={() => executePipeline(dataset, dateCol, priceCol, frequency, holdoutRatio)}
            onOpenUpload={() => setIsUploadOpen(true)}
          />

          <main className="flex-1 min-w-0 p-6 lg:p-8">
            {pipelineError && (
              <div className="mb-6 p-4 text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl">
                {pipelineError}
              </div>
            )}

            {activeTab === 'overview' && (
              <OverviewComparison
                result={analysisResult}
                onInspectModel={(id) => {
                  if (id !== 'ensemble') {
                    setSelectedModel(id);
                    setActiveTab('models');
                  }
                }}
                onGoToSummary={() => setActiveTab('summary')}
              />
            )}

            {activeTab === 'models' && (
              <ModelDetailView
                result={analysisResult}
                selectedModel={selectedModel}
                onSelectModel={setSelectedModel}
              />
            )}

            {activeTab === 'volatility' && <VolatilityLabView result={analysisResult} />}

            {activeTab === 'summary' && <SummaryReportView result={analysisResult} />}

            {activeTab === 'data' && (
              <DataExplorerView
                dataset={dataset}
                result={analysisResult}
                onOpenUpload={() => setIsUploadOpen(true)}
              />
            )}
          </main>
        </div>
      )}

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onDatasetLoaded={handleDatasetLoaded}
      />

      {/* Active Computing Indicator Overlay */}
      {isComputing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="status"
          aria-live="polite"
        >
          <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="font-display text-base font-bold text-slate-900">
              Calibrating Multi-Model Econometrics &amp; ML
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Running ARIMA, SVR (RBF), GA-RNN, 3-State Gaussian HMM, Local Linear Kalman Filter, and AR(2)-GARCH/EGARCH Volatility Lab...
            </p>
            <div className="text-[11px] font-mono text-blue-700 bg-blue-50 py-1.5 px-3 rounded-lg border border-blue-100">
              High-performance econometrics engine calculating
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
