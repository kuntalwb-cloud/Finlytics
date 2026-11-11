import React, { useMemo, useState } from 'react';

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
  strokeWidth?: number;
}

interface MultiSeriesChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  forecastStartIndex?: number;
  bandLower?: (number | null)[];
  bandUpper?: (number | null)[];
  bandColor?: string;
  valuePrefix?: string;
  valueSuffix?: string;
  regimeStates?: number[]; // 0=Bear, 1=Neutral, 2=Bull
}

export const MultiSeriesChart: React.FC<MultiSeriesChartProps> = ({
  labels,
  series,
  height = 340,
  forecastStartIndex,
  bandLower,
  bandUpper,
  bandColor = 'rgba(29, 78, 216, 0.12)',
  valuePrefix = '',
  valueSuffix = '',
  regimeStates,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 920;
  const pad = { top: 20, right: 24, bottom: 34, left: 66 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const { minVal, maxVal, yTicks } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v !== null && Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (bandLower) {
      for (const v of bandLower) {
        if (v !== null && Number.isFinite(v) && v < min) min = v;
      }
    }
    if (bandUpper) {
      for (const v of bandUpper) {
        if (v !== null && Number.isFinite(v) && v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 100;
    }
    if (Math.abs(max - min) < 1e-6) {
      min -= 1;
      max += 1;
    }
    const margin = (max - min) * 0.08;
    const lo = min - margin;
    const hi = max + margin;
    const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
    return { minVal: lo, maxVal: hi, yTicks: ticks };
  }, [series, bandLower, bandUpper]);

  const n = Math.max(2, labels.length);
  const xPos = (idx: number) => pad.left + (idx / (n - 1)) * plotW;
  const yPos = (val: number) => pad.top + ((maxVal - val) / (maxVal - minVal)) * plotH;

  const buildPath = (vals: (number | null)[]) => {
    let d = '';
    let penDown = false;
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i];
      if (v === null || !Number.isFinite(v)) {
        penDown = false;
        continue;
      }
      const x = xPos(i).toFixed(1);
      const y = yPos(v).toFixed(1);
      d += penDown ? ` L ${x} ${y}` : ` M ${x} ${y}`;
      penDown = true;
    }
    return d;
  };

  const bandPath = useMemo(() => {
    if (!bandLower || !bandUpper) return '';
    const upperPts: string[] = [];
    const lowerPts: string[] = [];
    for (let i = 0; i < labels.length; i++) {
      const u = bandUpper[i];
      const l = bandLower[i];
      if (u !== null && l !== null && Number.isFinite(u) && Number.isFinite(l)) {
        upperPts.push(`${xPos(i).toFixed(1)},${yPos(u).toFixed(1)}`);
        lowerPts.unshift(`${xPos(i).toFixed(1)},${yPos(l).toFixed(1)}`);
      }
    }
    if (upperPts.length < 2) return '';
    return `M ${upperPts.join(' L ')} L ${lowerPts.join(' L ')} Z`;
  }, [bandLower, bandUpper, labels.length, minVal, maxVal]);

  const xTickIndices = useMemo(() => {
    const count = Math.min(6, labels.length);
    if (count <= 1) return [0];
    return Array.from({ length: count }, (_, i) => Math.round((i * (labels.length - 1)) / (count - 1)));
  }, [labels.length]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const norm = (relX - pad.left) / plotW;
    const idx = Math.max(0, Math.min(labels.length - 1, Math.round(norm * (n - 1))));
    setHoverIdx(idx);
  };

  return (
    <div className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Optional HMM Regime Background Shading */}
        {regimeStates &&
          regimeStates.map((st, idx) => {
            if (idx >= labels.length - 1) return null;
            const x1 = xPos(idx);
            const x2 = xPos(idx + 1);
            const fill =
              st === 0
                ? 'rgba(220, 38, 38, 0.06)'
                : st === 2
                ? 'rgba(22, 163, 74, 0.06)'
                : 'rgba(100, 116, 139, 0.04)';
            return <rect key={idx} x={x1} y={pad.top} width={Math.max(1, x2 - x1)} height={plotH} fill={fill} />;
          })}

        {/* Forecast Zone Shade */}
        {forecastStartIndex !== undefined && forecastStartIndex > 0 && forecastStartIndex < labels.length && (
          <g>
            <rect
              x={xPos(forecastStartIndex - 1)}
              y={pad.top}
              width={Math.max(0, pad.left + plotW - xPos(forecastStartIndex - 1))}
              height={plotH}
              fill="rgba(29, 78, 216, 0.035)"
            />
            <line
              x1={xPos(forecastStartIndex - 1)}
              y1={pad.top}
              x2={xPos(forecastStartIndex - 1)}
              y2={pad.top + plotH}
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={xPos(forecastStartIndex - 1) + 6}
              y={pad.top + 13}
              className="fill-slate-500 text-[10px] font-medium"
            >
              Forecast Horizon
            </text>
          </g>
        )}

        {/* Horizontal Grid & Y-Axis Ticks */}
        {yTicks.map((t, i) => {
          const y = yPos(t);
          return (
            <g key={i}>
              <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px] font-mono tabular-nums"
              >
                {valuePrefix}
                {Math.abs(t) >= 1000 ? t.toFixed(0) : t.toFixed(2)}
                {valueSuffix}
              </text>
            </g>
          );
        })}

        {/* X-Axis Ticks */}
        {xTickIndices.map((idx) => (
          <text
            key={idx}
            x={xPos(idx)}
            y={pad.top + plotH + 20}
            textAnchor="middle"
            className="fill-slate-500 text-[11px] font-mono tabular-nums"
          >
            {labels[idx]}
          </text>
        ))}

        {/* Confidence Band */}
        {bandPath && <path d={bandPath} fill={bandColor} />}

        {/* Lines */}
        {series.map((s) => (
          <path
            key={s.id}
            d={buildPath(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Hover Crosshair & Active Dots */}
        {hoverIdx !== null && (
          <g>
            <line
              x1={xPos(hoverIdx)}
              y1={pad.top}
              x2={xPos(hoverIdx)}
              y2={pad.top + plotH}
              stroke="#64748b"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            {series.map((s) => {
              const v = s.values[hoverIdx];
              if (v === null || !Number.isFinite(v)) return null;
              return (
                <circle
                  key={s.id}
                  cx={xPos(hoverIdx)}
                  cy={yPos(v)}
                  r={3.5}
                  fill="#ffffff"
                  stroke={s.color}
                  strokeWidth={2}
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* Floating Tooltip */}
      {hoverIdx !== null && (
        <div
          className="pointer-events-none absolute top-2 right-3 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-3 py-2 shadow-sm text-xs z-10 min-w-[180px]"
        >
          <div className="font-mono font-semibold text-slate-900 pb-1 mb-1 border-b border-slate-100">
            {labels[hoverIdx]}
          </div>
          <div className="space-y-1">
            {series.map((s) => {
              const v = s.values[hoverIdx];
              if (v === null || !Number.isFinite(v)) return null;
              return (
                <div key={s.id} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="inline-block w-2 h-2 rounded-xs" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {valuePrefix}
                    {v.toFixed(2)}
                    {valueSuffix}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

interface BarDiagnosticChartProps {
  values: number[];
  labels?: string[];
  height?: number;
  barColor?: string;
  thresholdLine?: number;
  title?: string;
}

export const BarDiagnosticChart: React.FC<BarDiagnosticChartProps> = ({
  values,
  labels,
  height = 180,
  barColor = '#1d4ed8',
  thresholdLine,
}) => {
  const width = 460;
  const pad = { top: 14, right: 16, bottom: 26, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxAbs = Math.max(0.25, thresholdLine ?? 0, ...values.map((v) => Math.abs(v)));
  const minV = Math.min(0, ...values) < 0 ? -maxAbs * 1.15 : 0;
  const maxV = maxAbs * 1.15;

  const yPos = (v: number) => pad.top + ((maxV - v) / (maxV - minV)) * plotH;
  const zeroY = yPos(0);
  const barW = Math.max(6, plotW / Math.max(1, values.length) - 6);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <line x1={pad.left} y1={zeroY} x2={pad.left + plotW} y2={zeroY} stroke="#94a3b8" strokeWidth="1" />
      {thresholdLine !== undefined && (
        <>
          <line
            x1={pad.left}
            y1={yPos(thresholdLine)}
            x2={pad.left + plotW}
            y2={yPos(thresholdLine)}
            stroke="#dc2626"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
          <line
            x1={pad.left}
            y1={yPos(-thresholdLine)}
            x2={pad.left + plotW}
            y2={yPos(-thresholdLine)}
            stroke="#dc2626"
            strokeWidth="1"
            strokeDasharray="4 3"
          />
        </>
      )}
      <text x={pad.left - 6} y={pad.top + 8} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
        {maxV.toFixed(2)}
      </text>
      <text x={pad.left - 6} y={zeroY + 3} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
        0.00
      </text>
      {minV < 0 && (
        <text x={pad.left - 6} y={pad.top + plotH} textAnchor="end" className="fill-slate-500 text-[10px] font-mono">
          {minV.toFixed(2)}
        </text>
      )}
      {values.map((v, i) => {
        const cx = pad.left + ((i + 0.5) / values.length) * plotW;
        const y = yPos(v);
        const top = Math.min(y, zeroY);
        const h = Math.max(1, Math.abs(y - zeroY));
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={top} width={barW} height={h} fill={v >= 0 ? barColor : '#64748b'} rx={1} />
            <text
              x={cx}
              y={pad.top + plotH + 15}
              textAnchor="middle"
              className="fill-slate-500 text-[9px] font-mono"
            >
              {labels ? labels[i] : i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
