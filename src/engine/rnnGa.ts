import { DataPoint, ForecastPoint, RnnGaResult, SeriesFrequency } from '../types/timeseries';
import { generateFutureDates } from '../utils/dataParser';
import { computeMetrics, mean, stdDev } from './mathUtils';

interface ElmanWeights {
  hiddenUnits: number;
  Wxh: number[][]; // hidden x 1 (sequential scalar return input at each step)
  Whh: number[][]; // hidden x hidden (recurrent context)
  bh: number[];
  Why: number[]; // 1 x hidden
  by: number;
}

interface Chromosome {
  hiddenUnits: number;
  inputWindow: number;
  learningRate: number;
  decay: number;
  weights: ElmanWeights;
  fitnessMse: number;
}

function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function initElmanWeights(hiddenUnits: number, rng: () => number): ElmanWeights {
  const scaleX = Math.sqrt(1 / Math.max(1, hiddenUnits));
  const scaleH = 0.35 / Math.sqrt(Math.max(1, hiddenUnits));
  const Wxh = Array.from({ length: hiddenUnits }, () => [(rng() * 2 - 1) * scaleX]);
  const Whh = Array.from({ length: hiddenUnits }, () =>
    Array.from({ length: hiddenUnits }, () => (rng() * 2 - 1) * scaleH)
  );
  const bh = Array.from({ length: hiddenUnits }, () => (rng() * 2 - 1) * 0.05);
  const Why = Array.from({ length: hiddenUnits }, () => (rng() * 2 - 1) * scaleX);
  const by = 0;
  return { hiddenUnits, Wxh, Whh, bh, Why, by };
}

function cloneWeights(w: ElmanWeights): ElmanWeights {
  return {
    hiddenUnits: w.hiddenUnits,
    Wxh: w.Wxh.map((r) => [...r]),
    Whh: w.Whh.map((r) => [...r]),
    bh: [...w.bh],
    Why: [...w.Why],
    by: w.by,
  };
}

function forwardSequence(w: ElmanWeights, seq: number[]): { pred: number; states: number[][] } {
  const H = w.hiddenUnits;
  let hPrev = new Array(H).fill(0);
  const states: number[][] = [hPrev];

  for (let t = 0; t < seq.length; t++) {
    const x = seq[t];
    const hCurr = new Array(H).fill(0);
    for (let i = 0; i < H; i++) {
      let sum = w.Wxh[i][0] * x + w.bh[i];
      for (let j = 0; j < H; j++) {
        sum += w.Whh[i][j] * hPrev[j];
      }
      hCurr[i] = Math.tanh(sum);
    }
    hPrev = hCurr;
    states.push(hCurr);
  }

  let pred = w.by;
  for (let i = 0; i < H; i++) {
    pred += w.Why[i] * hPrev[i];
  }
  return { pred, states };
}

function evaluateSequences(w: ElmanWeights, seqs: number[][], targets: number[]): number {
  if (seqs.length === 0) return 1e6;
  let sq = 0;
  for (let i = 0; i < seqs.length; i++) {
    const { pred } = forwardSequence(w, seqs[i]);
    const e = targets[i] - pred;
    sq += e * e;
  }
  return sq / seqs.length;
}

// One BPTT fine-tuning pass over sequence dataset
function fineTuneBptt(
  w: ElmanWeights,
  seqs: number[][],
  targets: number[],
  lr: number,
  decay: number,
  epochs: number
): void {
  const H = w.hiddenUnits;
  for (let ep = 0; ep < epochs; ep++) {
    for (let s = 0; s < seqs.length; s++) {
      const seq = seqs[s];
      const { pred, states } = forwardSequence(w, seq);
      const err = pred - targets[s];
      const gradOut = Math.max(-2, Math.min(2, 2 * err));

      const hLast = states[seq.length];
      // Update output layer
      for (let i = 0; i < H; i++) {
        w.Why[i] = w.Why[i] * (1 - decay) - lr * gradOut * hLast[i];
      }
      w.by -= lr * gradOut;

      // Backprop through time across sequence steps
      let dhNext = new Array(H).fill(0);
      for (let i = 0; i < H; i++) {
        dhNext[i] = gradOut * w.Why[i];
      }

      for (let t = seq.length - 1; t >= 0; t--) {
        const hCurr = states[t + 1];
        const hPrev = states[t];
        const x = seq[t];
        const dhPrev = new Array(H).fill(0);

        for (let i = 0; i < H; i++) {
          const dtanh = dhNext[i] * (1 - hCurr[i] * hCurr[i]);
          const clipped = Math.max(-1.5, Math.min(1.5, dtanh));
          w.Wxh[i][0] = w.Wxh[i][0] * (1 - decay) - lr * clipped * x;
          w.bh[i] -= lr * clipped;
          for (let j = 0; j < H; j++) {
            w.Whh[i][j] = w.Whh[i][j] * (1 - decay) - lr * clipped * hPrev[j];
            dhPrev[j] += clipped * w.Whh[i][j];
          }
        }
        dhNext = dhPrev;
      }
    }
  }
}

function crossoverWeights(a: ElmanWeights, b: ElmanWeights, rng: () => number): ElmanWeights {
  const H = a.hiddenUnits;
  const child = cloneWeights(a);
  const alpha = rng();
  for (let i = 0; i < H; i++) {
    child.Wxh[i][0] = alpha * a.Wxh[i][0] + (1 - alpha) * b.Wxh[i][0];
    child.bh[i] = alpha * a.bh[i] + (1 - alpha) * b.bh[i];
    child.Why[i] = alpha * a.Why[i] + (1 - alpha) * b.Why[i];
    for (let j = 0; j < H; j++) {
      child.Whh[i][j] = alpha * a.Whh[i][j] + (1 - alpha) * b.Whh[i][j];
    }
  }
  child.by = alpha * a.by + (1 - alpha) * b.by;
  return child;
}

function mutateWeights(w: ElmanWeights, rate: number, scale: number, rng: () => number): void {
  const H = w.hiddenUnits;
  for (let i = 0; i < H; i++) {
    if (rng() < rate) w.Wxh[i][0] += (rng() * 2 - 1) * scale;
    if (rng() < rate) w.bh[i] += (rng() * 2 - 1) * scale * 0.5;
    if (rng() < rate) w.Why[i] += (rng() * 2 - 1) * scale;
    for (let j = 0; j < H; j++) {
      if (rng() < rate) w.Whh[i][j] += (rng() * 2 - 1) * scale * 0.7;
    }
  }
  if (rng() < rate) w.by += (rng() * 2 - 1) * scale * 0.5;
}

function buildReturnSequences(rets: number[], window: number): { seqs: number[][]; targets: number[] } {
  const seqs: number[][] = [];
  const targets: number[] = [];
  for (let t = window; t < rets.length; t++) {
    seqs.push(rets.slice(t - window, t));
    targets.push(rets[t]);
  }
  return { seqs, targets };
}

export function runRnnGaModel(
  series: DataPoint[],
  frequency: SeriesFrequency,
  horizonSteps: number,
  holdoutSize: number
): RnnGaResult {
  const t0 = performance.now();
  const prices = series.map((s) => s.close);
  const n = prices.length;
  const trainEnd = Math.max(20, n - holdoutSize);

  const rets: number[] = [];
  for (let i = 1; i < n; i++) {
    rets.push(Math.log(Math.max(1e-6, prices[i]) / Math.max(1e-6, prices[i - 1])));
  }

  const trainRetsRaw = rets.slice(0, trainEnd - 1);
  const rMean = mean(trainRetsRaw);
  const rStd = Math.max(1e-5, stdDev(trainRetsRaw, false));
  const normRets = rets.map((r) => (r - rMean) / rStd);
  const trainNorm = normRets.slice(0, trainEnd - 1);

  const rng = createRng(1337 + n);
  const hiddenUnits = 5;
  const inputWindow = frequency === 'monthly' ? 4 : 6;
  const popSize = 12;
  const generations = 8;
  const crossoverRate = 0.75;
  const mutationRate = 0.22;

  // Window training sequences to the most recent 160 observations for rapid & relevant convergence
  const trainSampleLimit = Math.min(160, trainNorm.length);
  const recentTrainNorm = trainNorm.slice(trainNorm.length - trainSampleLimit);

  const { seqs: allTrainSeqs, targets: allTrainTargets } = buildReturnSequences(recentTrainNorm, inputWindow);
  const valSplit = Math.max(4, Math.floor(allTrainSeqs.length * 0.22));
  const subSeqs = allTrainSeqs.slice(0, Math.max(4, allTrainSeqs.length - valSplit));
  const subTargets = allTrainTargets.slice(0, Math.max(4, allTrainTargets.length - valSplit));
  const valSeqs = allTrainSeqs.slice(Math.max(4, allTrainSeqs.length - valSplit));
  const valTargets = allTrainTargets.slice(Math.max(4, allTrainTargets.length - valSplit));

  let population: Chromosome[] = Array.from({ length: popSize }, () => {
    const lr = 0.008 + rng() * 0.02;
    const decay = 0.0005 + rng() * 0.002;
    const weights = initElmanWeights(hiddenUnits, rng);
    const fitnessMse = evaluateSequences(weights, valSeqs, valTargets);
    return { hiddenUnits, inputWindow, learningRate: lr, decay, weights, fitnessMse };
  });

  const fitnessHistory: { generation: number; bestMse: number; avgMse: number }[] = [];

  for (let gen = 1; gen <= generations; gen++) {
    population.sort((a, b) => a.fitnessMse - b.fitnessMse);
    const bestMse = population[0].fitnessMse;
    const avgMse = mean(population.map((c) => c.fitnessMse));
    fitnessHistory.push({ generation: gen, bestMse, avgMse });

    const nextPop: Chromosome[] = [
      // Elitism: keep top 2
      { ...population[0], weights: cloneWeights(population[0].weights) },
      { ...population[1], weights: cloneWeights(population[1].weights) },
    ];

    const selectTournament = () => {
      const a = population[Math.floor(rng() * popSize)];
      const b = population[Math.floor(rng() * popSize)];
      return a.fitnessMse < b.fitnessMse ? a : b;
    };

    while (nextPop.length < popSize) {
      const p1 = selectTournament();
      const p2 = selectTournament();
      const childWeights =
        rng() < crossoverRate ? crossoverWeights(p1.weights, p2.weights, rng) : cloneWeights(p1.weights);
      mutateWeights(childWeights, mutationRate, 0.12, rng);
      const lr = Math.max(0.004, Math.min(0.03, (p1.learningRate + p2.learningRate) / 2 + (rng() * 2 - 1) * 0.003));
      const decay = Math.max(0.0002, Math.min(0.004, (p1.decay + p2.decay) / 2));

      const fitnessMse = evaluateSequences(childWeights, valSeqs, valTargets);
      nextPop.push({ hiddenUnits, inputWindow, learningRate: lr, decay, weights: childWeights, fitnessMse });
    }
    population = nextPop;
  }

  population.sort((a, b) => a.fitnessMse - b.fitnessMse);
  const bestChrom = population[0];

  // Fine-tune best GA-evolved RNN on recent training window for holdout evaluation
  const trainRnnWeights = cloneWeights(bestChrom.weights);
  fineTuneBptt(trainRnnWeights, allTrainSeqs, allTrainTargets, bestChrom.learningRate, bestChrom.decay, 6);

  const holdoutActual: number[] = [];
  const holdoutPredicted: number[] = [];
  const holdoutPrev: number[] = [];

  for (let idx = trainEnd; idx < n; idx++) {
    const retIdx = idx - 1; // return ending at idx-1
    const seq = normRets.slice(Math.max(0, retIdx - inputWindow), retIdx);
    while (seq.length < inputWindow) seq.unshift(0);
    const { pred } = forwardSequence(trainRnnWeights, seq);
    const rawRet = Math.max(-0.22, Math.min(0.22, pred * rStd + rMean));
    const predPrice = prices[idx - 1] * Math.exp(rawRet);
    holdoutActual.push(prices[idx]);
    holdoutPredicted.push(predPrice);
    holdoutPrev.push(prices[idx - 1]);
  }

  // Final model refit on FULL dataset using GA-optimal architecture & hyperparameters
  const fullRMean = mean(rets);
  const fullRStd = Math.max(1e-5, stdDev(rets, false));
  const fullNormRets = rets.map((r) => (r - fullRMean) / fullRStd);
  const { seqs: fullSeqs, targets: fullTargets } = buildReturnSequences(fullNormRets, inputWindow);

  const fullWeights = cloneWeights(bestChrom.weights);
  fineTuneBptt(fullWeights, fullSeqs, fullTargets, bestChrom.learningRate, bestChrom.decay, 5);

  const fitted = [...prices];
  const residuals = new Array(n).fill(0);
  for (let t = inputWindow + 1; t < n; t++) {
    const seq = fullNormRets.slice(t - 1 - inputWindow, t - 1);
    const { pred } = forwardSequence(fullWeights, seq);
    const predRet = Math.max(-0.22, Math.min(0.22, pred * fullRStd + fullRMean));
    const predPrice = prices[t - 1] * Math.exp(predRet);
    fitted[t] = predPrice;
    residuals[t] = prices[t] - predPrice;
  }

  const finalTrainLoss = evaluateSequences(fullWeights, fullSeqs, fullTargets);
  const resStd = Math.max(1e-6, stdDev(residuals.slice(inputWindow + 1), true));

  // Multi-step recursive forecast
  const futureDates = generateFutureDates(series[n - 1].date, frequency, horizonSteps);
  const forecast: ForecastPoint[] = [];
  const normCursor = [...fullNormRets];
  let priceCursor = prices[n - 1];

  for (let h = 0; h < horizonSteps; h++) {
    const seq = normCursor.slice(normCursor.length - inputWindow);
    const { pred } = forwardSequence(fullWeights, seq);
    const clampedNorm = Math.max(-3, Math.min(3, pred));
    normCursor.push(clampedNorm);
    const rawRet = Math.max(-0.18, Math.min(0.18, clampedNorm * fullRStd + fullRMean));
    priceCursor = Math.max(1e-4, priceCursor * Math.exp(rawRet));

    const band = 1.96 * resStd * Math.sqrt(h + 1);
    forecast.push({
      step: h + 1,
      date: futureDates[h],
      point: priceCursor,
      lower95: Math.max(1e-4, priceCursor - band),
      upper95: priceCursor + band,
    });
  }

  const metrics = computeMetrics(holdoutActual, holdoutPredicted, holdoutPrev);
  const endForecast = forecast[forecast.length - 1]?.point ?? prices[n - 1];
  const chgPct = ((endForecast - prices[n - 1]) / prices[n - 1]) * 100;

  return {
    id: 'rnn_ga',
    name: 'GA-Optimized Recurrent Neural Network',
    shortName: 'GA-RNN',
    category: 'Machine Learning',
    equationSummary: `h_t = tanh(W_xh·x_t + W_hh·h_{t-1} + b_h), y_t = W_hy·h_t + b_y  [GA Pop=${popSize}, Gen=${generations}, H=${hiddenUnits}]`,
    fitted,
    residuals,
    holdoutActual,
    holdoutPredicted,
    metrics,
    forecast,
    computationMs: performance.now() - t0,
    architecture: {
      inputWindow,
      hiddenUnits,
      activation: 'tanh',
    },
    gaConfig: {
      populationSize: popSize,
      generations,
      crossoverRate,
      mutationRate,
      bestLearningRate: bestChrom.learningRate,
      bestDecay: bestChrom.decay,
    },
    fitnessHistory,
    finalTrainLoss,
    interpretation: `Genetic Algorithm evolved ${popSize} Elman-RNN chromosomes over ${generations} generations (Window=${inputWindow}, Hidden=${hiddenUnits}, LR=${bestChrom.learningRate.toFixed(4)}), converging validation MSE from ${fitnessHistory[0]?.bestMse.toFixed(4) ?? '—'} to ${bestChrom.fitnessMse.toFixed(4)}. Projects ${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}% over horizon.`,
  };
}
