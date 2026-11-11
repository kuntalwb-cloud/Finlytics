import { useCallback, useEffect, useState } from 'react';
import { Upload, ArrowUpRight, TrendingUp, Cpu, FileSpreadsheet } from 'lucide-react';
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
import { buildSeriesFromRows } from './utils/dataParser';

export default function App() {
  // Show welcome screen initially until user clicks "Enter Workspace"
  const [showWelcome, setShowWelcome] = useState<boolean>(true);

  const [dataset, setDataset] = useState<ParsedDataset | null>(null);
  const [dateCol, setDateCol] = useState<string>('');
  const [priceCol, setPriceCol] = useState<string>('');
  const [frequency, setFrequency] = useState<SeriesFrequency>('daily');
  const [holdoutRatio, setHoldoutRatio] = useState<number>(0.15);

  const [analysisResult, setAnalysisResult] = useState<FullAnalysisResult | null>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [selectedModel, setSelectedModel] = useState<Exclude<ModelId, 'ensemble'>>('arima');
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

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
          if (series.length < 25) {
            throw new Error(
              `Column "${pCol}" yielded only ${series.length} valid positive numeric rows. At least 25 chronological records are required for econometric and ML estimation.`
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

            {/* Upload Call to Action Box */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setIsUploadOpen(true)}
                className="inline-flex items-center gap-3 px-6 py-3.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-xl transition-all shadow-md hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                Upload Excel or CSV Sheet
                <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </button>
              <div className="mt-2 text-xs text-slate-500">
                Supports daily stock prices, monthly closing prices, macroeconomic series, and custom OHLCV data.
              </div>
            </div>

            {/* Methodology Showcase Grid */}
            <div className="pt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
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
    </div>
  );
}
