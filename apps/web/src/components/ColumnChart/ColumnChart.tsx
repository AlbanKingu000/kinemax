import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { useMessages } from '../../i18n/use-messages';
import styles from './ColumnChart.module.css';
import { niceMax } from './nice-max';

export interface ChartSeries {
  key: string;
  label: string;
  /** Series slot in the fixed categorical order (tokens --color-chart-1, --color-chart-2). */
  slot: 1 | 2;
}

export interface ChartDatum {
  /** Full label (tooltip, table), e.g. "16 tet 2026". */
  label: string;
  /** Short axis label, e.g. "16". */
  short: string;
  values: Record<string, number>;
}

interface ColumnChartProps {
  title: string;
  series: readonly ChartSeries[];
  data: readonly ChartDatum[];
  formatValue: (value: number) => string;
  /** Header of the first table column (e.g. "Dita"). */
  categoryLabel: string;
  totalLabel: string;
  /** Smallest axis maximum, so an empty chart still has a readable scale (e.g. 100 €). */
  minScale?: number;
}

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 64 };
const GAP = 2; // surface gap between stacked segments
const MAX_BAR = 24;

/** Width of an element, following resizes (600 where ResizeObserver is missing, e.g. tests). */
function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [ref]);
  return width;
}

/**
 * Stacked columns in our own SVG (no chart library): a legend, a hover tooltip per column and a
 * data table behind a toggle, so nothing depends on colour or a mouse.
 */
export function ColumnChart({
  title,
  series,
  data,
  formatValue,
  categoryLabel,
  totalLabel,
  minScale = 1,
}: ColumnChartProps) {
  const t = useMessages();
  const tableId = useId();
  const plotRef = useRef<HTMLDivElement>(null);
  const width = useWidth(plotRef);
  const [showTable, setShowTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  // shortcut: negative parts (a day with more refunds than sales) are drawn as 0; the table
  // shows the real values.
  const total = (d: ChartDatum) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0);
  const max = niceMax(Math.max(minScale, ...data.map(total)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(MAX_BAR, Math.max(4, band * 0.6));
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44)));
  const hovered = hover === null ? undefined : data[hover];

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>
        <span className={styles.title}>{title}</span>
        <ul className={styles.legend}>
          {series.map((s) => (
            <li key={s.key}>
              <span className={styles.swatch} data-slot={s.slot} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      </figcaption>
      <div ref={plotRef} className={styles.plot}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={t.chart.summary(title, data.length)}
          onMouseLeave={() => {
            setHover(null);
          }}
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                className={styles.grid}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(max * f)}
                y2={y(max * f)}
              />
              <text className={styles.axis} x={PAD.left - 8} y={y(max * f) + 4} textAnchor="end">
                {formatValue(max * f)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + band * i + (band - barW) / 2;
            let base = 0;
            return (
              <g key={d.label}>
                {series.map((s, si) => {
                  const value = Math.max(0, d.values[s.key] ?? 0);
                  if (value === 0) return null;
                  const top = y(base + value);
                  const bottom = y(base) - (si > 0 && base > 0 ? GAP : 0);
                  base += value;
                  const last = series.slice(si + 1).every((n) => (d.values[n.key] ?? 0) <= 0);
                  return (
                    <path
                      key={s.key}
                      className={styles.bar}
                      data-slot={s.slot}
                      d={columnPath(x, top, barW, Math.max(1, bottom - top), last)}
                    />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text className={styles.axis} x={x + barW / 2} y={HEIGHT - 6} textAnchor="middle">
                    {d.short}
                  </text>
                )}
                <rect
                  className={styles.hit}
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  onMouseEnter={() => {
                    setHover(i);
                  }}
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(width - 180, Math.max(0, PAD.left + band * hover + band / 2 - 90)),
            }}
            aria-hidden="true"
          >
            <strong>{hovered.label}</strong>
            {series.map((s) => (
              <span key={s.key}>
                <span className={styles.swatch} data-slot={s.slot} />
                {s.label}: {formatValue(hovered.values[s.key] ?? 0)}
              </span>
            ))}
            <span>
              {totalLabel}: {formatValue(total(hovered))}
            </span>
          </div>
        )}
      </div>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={showTable}
        aria-controls={tableId}
        onClick={() => {
          setShowTable((v) => !v);
        }}
      >
        {showTable ? t.chart.hideTable : t.chart.showTable}
      </button>
      <div id={tableId} hidden={!showTable} className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{categoryLabel}</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.label}
                </th>
              ))}
              <th scope="col">{totalLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                {series.map((s) => (
                  <td key={s.key}>{formatValue(d.values[s.key] ?? 0)}</td>
                ))}
                <td>{formatValue(total(d))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** A column with a 4px rounded top (only on the topmost segment), square at the baseline. */
function columnPath(x: number, top: number, w: number, h: number, roundTop: boolean): string {
  const r = roundTop ? Math.min(4, w / 2, h) : 0;
  return `M${String(x)},${String(top + h)}V${String(top + r)}Q${String(x)},${String(top)} ${String(x + r)},${String(top)}H${String(x + w - r)}Q${String(x + w)},${String(top)} ${String(x + w)},${String(top + r)}V${String(top + h)}Z`;
}
