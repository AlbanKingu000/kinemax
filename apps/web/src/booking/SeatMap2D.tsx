import type { SeatMapResponse, SeatMapSeat } from '@kinemax/shared';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../components/Icon/Icon';
import { formatPrice } from '../i18n/format';
import { useLocale, useMessages } from '../i18n/use-messages';
import { neighbour, rowsOf } from './selection';
import styles from './SeatMap2D.module.css';

interface SeatMap2DProps {
  map: SeatMapResponse;
  selected: readonly string[];
  /** `shiftKey`: the admin seat editor selects a range with Shift. */
  onToggle: (seat: SeatMapSeat, event: { shiftKey: boolean }) => void;
  /** "Shiko pamjen" for the focused seat (opens the view from that seat in 3D). */
  onView?: ((seat: SeatMapSeat) => void) | undefined;
  /** Seat editor: the spoken label of a seat (default: row, number, type, status, price). */
  describe?: (seat: SeatMapSeat) => string;
  /** Seat editor: TAKEN (greyed, inactive) seats can be selected too. */
  selectTaken?: boolean;
  /** Seat editor: the pointer moved onto a seat with the button pressed (drag to select). */
  onSweep?: (seat: SeatMapSeat) => void;
}

const UNIT = 0.62; // meters of hall per seat unit, for the layout scale

/**
 * Top-down map from the real seat coordinates, screen at the top. Every seat is a real button with
 * a full spoken label; one tab stop for the whole map (roving tabindex), arrows move along and
 * between rows, Home/End jump within a row, Enter/Space select.
 */
export function SeatMap2D({
  map,
  selected,
  onToggle,
  onView,
  describe,
  selectTaken = false,
  onSweep,
}: SeatMap2DProps) {
  const t = useMessages();
  const { locale } = useLocale();
  const rows = useMemo(() => rowsOf(map.seats), [map.seats]);
  const [focusId, setFocusId] = useState<string | undefined>(
    () => map.seats.find((s) => s.status === 'AVAILABLE')?.id ?? map.seats[0]?.id,
  );
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const bounds = useMemo(() => {
    const xs = map.seats.flatMap((s) => [
      s.x - (s.widthUnits * UNIT) / 2,
      s.x + (s.widthUnits * UNIT) / 2,
    ]);
    const ys = map.seats.map((s) => s.y);
    return {
      minX: Math.min(...xs, -map.hall.screen.widthM / 2),
      maxX: Math.max(...xs, map.hall.screen.widthM / 2),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [map]);
  const width = bounds.maxX - bounds.minX || 1;
  const depth = bounds.maxY - bounds.minY || 1;

  const defaultLabel = (seat: SeatMapSeat) => {
    const price = map.prices[seat.type];
    return [
      t.seats.rowSeat(seat.row, seat.number),
      t.seats.types[seat.type],
      seat.status === 'TAKEN'
        ? t.seats.taken
        : selected.includes(seat.id)
          ? t.seats.selected
          : t.seats.free,
      price !== undefined ? formatPrice(locale, price) : null,
    ]
      .filter(Boolean)
      .join(', ');
  };

  const label = describe ?? defaultLabel;

  function onKeyDown(event: KeyboardEvent, seat: SeatMapSeat) {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const;
    const key = keys.find((k) => k === event.key);
    if (!key) return;
    event.preventDefault();
    const next = neighbour(rows, seat, key);
    if (!next) return;
    setFocusId(next.id);
    refs.current.get(next.id)?.focus();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.screen} aria-hidden="true">
        <span>{t.seats.screen}</span>
      </div>
      <div
        role="group"
        aria-label={t.seats.mapLabel(map.hall.name)}
        className={styles.map}
        style={{ aspectRatio: `${String(width + 1.2)} / ${String(depth + 1.6)}` }}
      >
        {rows.map((row) => (
          <span
            key={`label-${row[0]?.row ?? ''}`}
            className={styles.rowLabel}
            aria-hidden="true"
            style={{
              top: `${String((((row[0]?.y ?? 0) - bounds.minY + 0.8) / (depth + 1.6)) * 100)}%`,
            }}
          >
            {row[0]?.row}
          </span>
        ))}
        {map.seats.map((seat) => {
          const isSelected = selected.includes(seat.id);
          return (
            <button
              key={seat.id}
              ref={(node) => {
                if (node) refs.current.set(seat.id, node);
                else refs.current.delete(seat.id);
              }}
              type="button"
              className={styles.seat}
              data-type={seat.type}
              data-status={isSelected ? 'SELECTED' : seat.status}
              aria-pressed={isSelected}
              aria-disabled={
                seat.status === 'TAKEN' && !isSelected && !selectTaken ? true : undefined
              }
              aria-label={label(seat)}
              tabIndex={seat.id === focusId ? 0 : -1}
              style={{
                left: `${String(((seat.x - bounds.minX + 0.6) / (width + 1.2)) * 100)}%`,
                top: `${String(((seat.y - bounds.minY + 0.8) / (depth + 1.6)) * 100)}%`,
                width: `${String(((seat.widthUnits * UNIT * 0.86) / (width + 1.2)) * 100)}%`,
              }}
              onFocus={() => {
                setFocusId(seat.id);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, seat);
              }}
              onClick={(event) => {
                if (seat.status === 'TAKEN' && !isSelected && !selectTaken) return;
                onToggle(seat, { shiftKey: event.shiftKey });
              }}
              onPointerEnter={(event) => {
                if (onSweep && event.buttons === 1) onSweep(seat);
              }}
            >
              <span aria-hidden="true">
                {seat.type === 'WHEELCHAIR' ? (
                  <Icon name="wheelchair" size={14} />
                ) : seat.type === 'COMPANION' ? (
                  <Icon name="plus" size={12} />
                ) : (
                  seat.number
                )}
              </span>
            </button>
          );
        })}
      </div>
      {onView && focusId && (
        <button
          type="button"
          className={styles.view}
          onClick={() => {
            const seat = map.seats.find((s) => s.id === focusId);
            if (seat) onView(seat);
          }}
        >
          {t.seats.viewFrom(
            t.seats.rowSeat(
              map.seats.find((s) => s.id === focusId)?.row ?? '',
              map.seats.find((s) => s.id === focusId)?.number ?? 0,
            ),
          )}
        </button>
      )}
    </div>
  );
}
