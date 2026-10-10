import React, { useState } from 'react';
import {
  BarElement, CategoryScale, Chart as ChartJS, ChartData, ChartOptions, Legend, LinearScale, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { formatINR } from './taxUi';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

// Validated with the dataviz palette validator against Artha's dark chart surface
// (#0d111d): all five slots pass lightness, chroma, CVD (worst adjacent ΔE 8.4),
// normal-vision and 3:1 contrast checks. Assign in this fixed order; never cycle.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'] as const;
export const SURFACE = '#0d111d';
const INK_SECONDARY = '#94a3b8';
const GRID = 'rgba(255, 255, 255, 0.06)';
const AXIS = 'rgba(255, 255, 255, 0.12)';
// Regime identity is fixed across every chart.
export const REGIME_COLOR = { new: SERIES[0], old: SERIES[1] } as const;
export const NEUTRAL_TOTAL = '#94a3b8';

export const compactINR = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)}L`;
  if (abs >= 1e3) return `${sign}₹${(abs / 1e3).toFixed(0)}k`;
  return `${sign}₹${abs.toFixed(0)}`;
};

type Fmt = 'inr' | 'pct';

export function barOptions(fmt: Fmt, opts: { stacked?: boolean; horizontal?: boolean; legend?: boolean } = {}): ChartOptions<'bar'> {
  const valueAxis = opts.horizontal ? 'x' : 'y';
  const format = (v: number) => (fmt === 'pct' ? `${v.toFixed(1)}%` : compactINR(v));
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: opts.horizontal ? 'y' : 'x',
    animation: false,
    interaction: { mode: 'nearest', intersect: true },
    plugins: {
      legend: {
        display: opts.legend ?? true,
        position: 'top',
        align: 'start',
        labels: { color: INK_SECONDARY, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded', font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: '#151b2c',
        borderColor: AXIS,
        borderWidth: 1,
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const raw = ctx.raw as number | [number, number];
            const value = Array.isArray(raw) ? raw[1] - raw[0] : raw;
            const text = fmt === 'pct' ? `${value.toFixed(2)}%` : formatINR(value);
            return `${ctx.dataset.label ? `${ctx.dataset.label}: ` : ''}${text}`;
          },
        },
      },
    },
    scales: {
      [valueAxis]: {
        stacked: opts.stacked,
        beginAtZero: true,
        grid: { color: GRID },
        border: { color: AXIS },
        ticks: { color: INK_SECONDARY, font: { size: 11 }, callback: (v) => format(Number(v)) },
      },
      [valueAxis === 'x' ? 'y' : 'x']: {
        stacked: opts.stacked,
        grid: { display: false },
        border: { color: AXIS },
        ticks: { color: INK_SECONDARY, font: { size: 11 } },
      },
    },
  };
}

/** Thin rounded bars with a 2px surface gap between touching marks. */
export function barDataset(label: string, data: (number | [number, number])[], color: string | string[], stacked = false) {
  return {
    label,
    data,
    backgroundColor: color,
    borderColor: SURFACE,
    borderWidth: stacked ? 2 : 0,
    borderRadius: 4,
    borderSkipped: stacked ? false : ('start' as const),
    maxBarThickness: 34,
    categoryPercentage: 0.7,
    barPercentage: 0.9,
  };
}

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

export const ChartCard: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  table: ChartTable;
  height?: number;
  children: React.ReactNode;
}> = ({ title, subtitle, table, height = 260, children }) => {
  const [showTable, setShowTable] = useState(false);
  return (
    <figure className="glass-panel" style={{ margin: 0, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <figcaption>
          <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          {subtitle && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5 }}>{subtitle}</div>}
        </figcaption>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
          onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Show chart' : 'Show data table'}
        </button>
      </div>
      {showTable ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table" style={{ marginTop: 0 }}>
            <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((cell, j) => (
                  <td key={j} style={{ textAlign: j === 0 ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {typeof cell === 'number' ? formatINR(cell) : cell}
                  </td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: 'relative', height }}>{children}</div>
      )}
    </figure>
  );
};

export const BarChart: React.FC<{ data: ChartData<'bar'>; options: ChartOptions<'bar'>; label: string }> = ({ data, options, label }) => (
  <Bar data={data} options={options} aria-label={label} role="img" />
);

/** Line options: same axes, ticks, tooltip and legend as the bar charts, one y-axis. */
export function lineOptions(fmt: Fmt): ChartOptions<'line'> {
  const base = barOptions(fmt) as unknown as ChartOptions<'line'>;
  return { ...base, interaction: { mode: 'index', intersect: false }, scales: { ...base.scales, y: { ...base.scales?.y, beginAtZero: false } } };
}

/** 2px line with 8px markers, as the dataviz mark specs ask. */
export function lineDataset(label: string, data: number[], color: string) {
  return { label, data, borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, tension: 0 };
}

export const LineChart: React.FC<{ data: ChartData<'line'>; options: ChartOptions<'line'>; label: string }> = ({ data, options, label }) => (
  <Line data={data} options={options} aria-label={label} role="img" />
);
