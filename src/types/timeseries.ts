export type SeriesFrequency = 'daily' | 'monthly';

export type ModelId = 'arima' | 'svr' | 'rnn_ga' | 'hmm' | 'kalman' | 'ensemble';

export interface DataPoint {
  index: number;
  date: string; // YYYY-MM-DD or YYYY-MM
  rawDate: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface ParsedDataset {
  fileName: string;
  sheetName: string;
  headers: string[];
  rows: Record<string, string | number | null>[];
  detectedDateCol: string;
  detectedPriceCol: string;
  detectedFrequency: SeriesFrequency;
  series: DataPoint[];
}

export interface DescriptiveStats {
  count: number;
  startDate: string;
  endDate: string;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  median: number;
  skewness: number;
  excessKurtosis: number;
  jarqueBeraStat: number;
  jarqueBeraPValue: number;
  adfStatistic: number;
  adfPValue: number;
  isStationaryLevel: boolean;
  isStationaryDiff1: boolean;
  totalReturnPct: number;
  annualizedReturnPct: number;
  annualizedVolPct: number;
  sharpeApprox: number;
  maxDrawdownPct: number;
}

export interface ModelMetrics {
  rmse: number;
  mae: number;
  mape: number;
  directionalAccuracy: number;
  theilU: number;
  rSquared: number;
  aic?: number;
  bic?: number;
}

export interface ForecastPoint {
  step: number;
  date: string;
  point: number;
  lower95: number;
  upper95: number;
}

export interface BaseModelResult {
  id: ModelId;
  name: string;
  shortName: string;
  category: 'Econometric' | 'Machine Learning' | 'State-Space' | 'Regime-Switching' | 'Consensus';
  equationSummary: string;
  fitted: number[]; // aligned to series indices (NaN or null-equivalent handled via number[])
  residuals: number[];
  holdoutActual: number[];
  holdoutPredicted: number[];
  metrics: ModelMetrics;
  forecast: ForecastPoint[];
  computationMs: number;
  interpretation: string;
}

export interface ArimaResult extends BaseModelResult {
  id: 'arima';
  order: { p: number; d: number; q: number };
  arCoeffs: number[];
  maCoeffs: number[];
  intercept: number;
  sigma2: number;
  logLikelihood: number;
  ljungBoxQ: number;
  ljungBoxP: number;
  acf: number[];
  pacf: number[];
  residualAcf: number[];
}

export interface SvrResult extends BaseModelResult {
  id: 'svr';
  kernel: 'RBF';
  cParam: number;
  epsilon: number;
  gamma: number;
  lookbackLags: number;
  numSupportVectors: number;
  supportVectorRatioPct: number;
  featureImportance: { feature: string; weight: number }[];
}

export interface RnnGaResult extends BaseModelResult {
  id: 'rnn_ga';
  architecture: {
    inputWindow: number;
    hiddenUnits: number;
    activation: 'tanh';
  };
  gaConfig: {
    populationSize: number;
    generations: number;
    crossoverRate: number;
    mutationRate: number;
    bestLearningRate: number;
    bestDecay: number;
  };
  fitnessHistory: { generation: number; bestMse: number; avgMse: number }[];
  finalTrainLoss: number;
}

export interface HmmResult extends BaseModelResult {
  id: 'hmm';
  numStates: number;
  stateLabels: string[];
  stateMeansPct: number[];
  stateVolsPct: number[];
  transitionMatrix: number[][];
  currentStateProbabilities: number[];
  currentDominantState: number;
  historicalStates: number[]; // decoded regime index per bar
  forecastRegimeProbs: number[][]; // step x state
}

export interface KalmanResult extends BaseModelResult {
  id: 'kalman';
  observationVarH: number;
  levelNoiseVarQ: number;
  slopeNoiseVarQ: number;
  signalToNoiseRatio: number;
  smoothedLevel: number[];
  smoothedSlope: number[];
  kalmanGainHistory: number[];
  finalLevel: number;
  finalSlope: number;
}

export interface VolatilityPoint {
  index: number;
  date: string;
  returnPct: number;
  garchVolAnnPct: number;
  egarchVolAnnPct: number;
}

export interface VolatilityForecastPoint {
  step: number;
  date: string;
  garchVolAnnPct: number;
  egarchVolAnnPct: number;
  garchPeriodVolPct: number;
  egarchPeriodVolPct: number;
}

export interface NewsImpactPoint {
  shockZ: number;
  garchResponseVar: number;
  egarchResponseVar: number;
}

export interface GarchFamilyParams {
  modelName: 'AR(2)-GARCH(1,1)' | 'AR(2)-EGARCH(1,1)';
  arPhi0: number;
  arPhi1: number;
  arPhi2: number;
  omega: number;
  alpha1: number;
  beta1: number;
  gamma1?: number; // leverage term for EGARCH
  persistence: number;
  halfLifePeriods: number | null;
  unconditionalVolAnnPct: number;
  logLikelihood: number;
  aic: number;
  bic: number;
  var95Pct: number;
  var99Pct: number;
  cvar95Pct: number;
}

export interface VolatilityAnalysisResult {
  garch: GarchFamilyParams;
  egarch: GarchFamilyParams;
  preferredVolatilityModel: 'AR(2)-GARCH(1,1)' | 'AR(2)-EGARCH(1,1)';
  leverageEffectDetected: boolean;
  leverageCommentary: string;
  historicalVolatility: VolatilityPoint[];
  forecastVolatility: VolatilityForecastPoint[];
  newsImpactCurve: NewsImpactPoint[];
  currentAnnualizedVolPct: number;
  forecastEndAnnualizedVolPct: number;
  volatilityTrend: 'Expanding' | 'Mean-Reverting / Contracting' | 'Stable';
  volatilityRegime: 'Low Volatility' | 'Moderate Volatility' | 'Elevated Volatility' | 'Stress Regime';
  trendReliabilityScore: 'High' | 'Moderate' | 'Low';
  trendAssessmentSummary: string;
}

export interface ComparativeSummary {
  bestPointModelId: ModelId;
  bestPointModelName: string;
  bestDirectionalModelName: string;
  rankedModels: {
    rank: number;
    id: ModelId;
    name: string;
    category: string;
    rmse: number;
    mae: number;
    mape: number;
    directionalAccuracy: number;
    theilU: number;
    rSquared: number;
    horizonEndPrice: number;
    impliedChangePct: number;
  }[];
  lastObservedPrice: number;
  lastObservedDate: string;
  horizonSteps: number;
  horizonLabel: string;
  ensembleEndPrice: number;
  ensembleImpliedChangePct: number;
  modelDispersionPct: number;
  marketBias: 'Bullish' | 'Moderately Bullish' | 'Neutral / Range-Bound' | 'Moderately Bearish' | 'Bearish';
  confidenceGrade: 'High' | 'Moderate' | 'Cautious';
  executiveNarrative: string;
  methodologyFindings: string[];
  conclusiveSuggestion: string;
  academicCaveats: string[];
}

export interface FullAnalysisResult {
  datasetName: string;
  frequency: SeriesFrequency;
  horizonSteps: number;
  holdoutSize: number;
  series: DataPoint[];
  stats: DescriptiveStats;
  arima: ArimaResult;
  svr: SvrResult;
  rnnGa: RnnGaResult;
  hmm: HmmResult;
  kalman: KalmanResult;
  ensemble: BaseModelResult;
  volatility: VolatilityAnalysisResult;
  summary: ComparativeSummary;
  generatedAtIso: string;
}
