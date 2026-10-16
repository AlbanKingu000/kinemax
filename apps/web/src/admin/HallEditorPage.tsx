import {
  seatTypeSchema,
  type HallLayoutResponse,
  type SeatMapResponse,
  type SeatMapSeat,
  type SeatTypeCode,
} from '@kinemax/shared';
import { lazy, Suspense, useId, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { fetchHallLayout, saveHallLayout } from '../api/admin';
import { ApiRequestError } from '../api/http';
import { SeatMap2D } from '../booking/SeatMap2D';
import { localDateTime } from '../booking/ticket-format';
import { Button } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Icon } from '../components/Icon/Icon';
import { Input } from '../components/Input/Input';
import { Link } from '../components/Link/Link';
import { Select } from '../components/Select/Select';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { useToast } from '../components/Toast/toast-context';
import { useAsync } from '../hooks/use-async';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { useAdminMessages } from '../i18n/admin-messages';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './AdminPage.module.css';
import {
  activate,
  addRow,
  addSeatsAfter,
  cellsOf,
  fromLayout,
  previewSeats,
  rangeKeys,
  remove,
  renameRow,
  setType,
  toInput,
  type Cell,
  type EditorRow,
} from './seat-editor';

const Hall3D = lazy(() => import('../booking/Hall3D'));
const noop = () => undefined;

/** /admin/halls/:id: the seat editor of one hall. */
export function HallEditorPage() {
  const { id = '' } = useParams();
  const e = useAdminMessages().editor;
  const t = useMessages();
  const state = useAsync((signal) => fetchHallLayout(id, signal), `layout:${id}`);
  if (state.status === 'loading') {
    return (
      <div aria-busy="true">
        <p role="status" className="visually-hidden">
          {t.common.loading}
        </p>
        <Skeleton shape="rect" height="24rem" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="warning"
        tone="error"
        title={e.loadError}
        headingLevel="h1"
        action={<Link to="/admin/halls">{e.back}</Link>}
      />
    );
  }
  return <Editor key={id} layout={state.data} />;
}

/** The preview's seat map: real hall data, a fake show (the 3D hall rebuilds per `version`). */
function previewMap(
  layout: HallLayoutResponse,
  seats: SeatMapSeat[],
  version: number,
): SeatMapResponse {
  return {
    showtime: {
      id: `00000000-0000-4000-8000-${String(version).padStart(12, '0')}`,
      startsAt: new Date(0).toISOString(),
      date: '1970-01-01',
      startTime: '00:00',
      format: '2D',
      languageVersion: 'DUBBED_SQ',
    },
    movie: {
      slug: 'preview',
      titleSq: layout.hall.name,
      titleEn: null,
      ageRating: 'ALL',
      durationMinutes: 1,
      genres: [],
      posterPath: null,
      // A raster image with a real size for the screen (an SVG without width/height is 0 × 0).
      backdropPath: '/apple-touch-icon.png',
    },
    location: { slug: 'preview', name: '', city: '', timeZone: 'Europe/Belgrade' },
    hall: {
      name: layout.hall.name,
      hallType: layout.hall.hallType,
      wholeHallOnly: layout.hall.wholeHallOnly,
      screen: layout.hall.screen,
    },
    seats,
    prices: {},
    wholeHall: null,
  };
}

function Editor({ layout: initial }: { layout: HallLayoutResponse }) {
  const e = useAdminMessages().editor;
  const t = useMessages();
  const { locale } = useLocale();
  const toast = useToast();
  const reducedMotion = usePrefersReducedMotion();
  const timeZone = useAdminLocation().selected?.timeZone ?? 'Europe/Belgrade';
  const typeId = useId();
  const labelId = useId();
  const [layout, setLayout] = useState(initial);
  const [original, setOriginal] = useState(() => fromLayout(initial));
  const [rows, setRows] = useState<EditorRow[]>(original);
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [type, setTypeValue] = useState<SeatTypeCode>('STANDARD');
  const [newLabel, setNewLabel] = useState('');
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [show3d, setShow3d] = useState(false);

  const seats = useMemo(() => previewSeats(rows, layout.spacing), [rows, layout.spacing]);
  const map = useMemo(() => previewMap(layout, seats, version), [layout, seats, version]);
  const byKey = useMemo(() => new Map(seats.map((seat) => [seat.id, seat])), [seats]);
  const nameOf = (key: string) => {
    const seat = byKey.get(key);
    return seat ? `${seat.row}${String(seat.number)}` : '';
  };
  const dirty = JSON.stringify(toInput(rows)) !== JSON.stringify(toInput(original));
  const cells = cellsOf(rows);
  const selectedCells = cells.filter((cell) => selection.has(cell.key));
  const selectedRows = [...new Set(selectedCells.map((cell) => byKey.get(cell.key)?.row))];
  const active = cells.filter((cell) => cell.isActive).length;

  const change = (
    next: EditorRow[],
    refused: Cell[] = [],
    reason: 'blocked' | 'capacity_history' = 'blocked',
  ) => {
    setRows(next);
    setVersion((v) => v + 1);
    setMessage(
      refused.length > 0
        ? { tone: 'error', text: e.refused[reason](refused.map((c) => nameOf(c.key)).join(', ')) }
        : null,
    );
  };

  const describe = (seat: SeatMapSeat) => {
    const cell = byKey.get(seat.id)?.cell;
    return [
      t.seats.rowSeat(seat.row, seat.number),
      t.seats.types[seat.type],
      cell && !cell.isActive ? e.states.inactive : null,
      cell && cell.blockedBy.length > 0 ? e.states.blocked(cell.blockedBy.length) : null,
      cell?.hasHistory ? e.states.history : null,
      selection.has(seat.id) ? t.seats.selected : null,
    ]
      .filter(Boolean)
      .join(', ');
  };

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveHallLayout(layout.hall.id, toInput(rows));
      const next = fromLayout(saved);
      setLayout(saved);
      setOriginal(next);
      setRows(next);
      setSelection(new Set());
      setVersion((v) => v + 1);
      toast.show({ tone: 'success', title: e.saved });
    } catch (error) {
      const fields = error instanceof ApiRequestError ? error.fields : [];
      const code = fields[0]?.code;
      const seatNames = fields
        .map((f) => nameOf(f.path.replace(/^seats\./, '')))
        .filter(Boolean)
        .join(', ');
      const text =
        code === 'blocked' || code === 'capacity_history'
          ? e.refused[code](seatNames)
          : code === 'has_history' || code === 'suite_booked' || code === 'duplicate'
            ? e.errors[code]
            : e.errors.generic;
      setMessage({ tone: 'error', text });
    } finally {
      setSaving(false);
    }
  }

  const blockers = selectedCells.filter((cell) => cell.blockedBy.length > 0);
  const when = (iso: string) => {
    const local = localDateTime(iso, timeZone);
    return `${formatReleaseDate(locale, local.date)} ${local.time}`;
  };

  return (
    <div className={styles.page}>
      <Link to="/admin/halls" className={styles.back}>
        <Icon name="chevronLeft" size={16} />
        {e.back}
      </Link>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{e.title(layout.hall.name)}</h1>
          <p className={styles.hint}>
            {pickText(locale, layout.hall.hallType.nameSq, layout.hall.hallType.nameEn)} ·{' '}
            {e.summary(active, cells.length - active, rows.length)}
          </p>
        </div>
        <div className={styles.actions}>
          {dirty && <span className={styles.hint}>{e.unsaved}</span>}
          <Button
            variant="secondary"
            size="sm"
            disabled={!dirty || saving}
            onClick={() => {
              change(original);
              setSelection(new Set());
            }}
          >
            {e.reset}
          </Button>
          <Button
            size="sm"
            icon="check"
            disabled={!dirty}
            loading={saving}
            onClick={() => void save()}
          >
            {e.save}
          </Button>
        </div>
      </header>
      <p className={styles.hint}>{e.intro}</p>
      {layout.hall.wholeHallOnly && <p className={styles.hint}>{e.suiteNote}</p>}

      <section className={styles.section} aria-label={e.tools}>
        <p className={styles.sectionTitle} role="status">
          {selection.size > 0 ? e.selected(selection.size) : e.noneSelected}
        </p>
        <div className={styles.toolbar}>
          <div className={styles.filter}>
            <label htmlFor={typeId}>{e.type}</label>
            <div className={styles.actions}>
              <Select
                id={typeId}
                value={type}
                onChange={(ev) => {
                  setTypeValue(seatTypeSchema.parse(ev.target.value));
                }}
              >
                {seatTypeSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {t.seats.types[value]}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={selection.size === 0}
                onClick={() => {
                  const result = setType(rows, selection, type);
                  const reason = result.refused.some((c) => c.blockedBy.length > 0)
                    ? 'blocked'
                    : 'capacity_history';
                  change(result.rows, result.refused, reason);
                }}
              >
                {e.applyType}
              </Button>
            </div>
          </div>
          {selectedRows.length === 1 && selectedRows[0] && (
            <div className={styles.filter}>
              <label htmlFor={labelId}>{e.rowLabel}</label>
              <div className={styles.actions}>
                <Input
                  id={labelId}
                  className={styles.labelInput}
                  value={newLabel || selectedRows[0]}
                  maxLength={2}
                  onChange={(ev) => {
                    setNewLabel(ev.target.value);
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const result = renameRow(
                      rows,
                      selectedRows[0] ?? '',
                      newLabel || (selectedRows[0] ?? ''),
                    );
                    if (result.problem) {
                      setMessage({ tone: 'error', text: e.renameProblems[result.problem] });
                    } else {
                      change(result.rows);
                      setNewLabel('');
                    }
                  }}
                >
                  {e.rename}
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className={styles.actions}>
          <Button
            size="sm"
            variant="secondary"
            icon="close"
            disabled={selection.size === 0}
            onClick={() => {
              const result = remove(rows, selection);
              change(result.rows, result.refused);
              setSelection(new Set(result.refused.map((c) => c.key)));
            }}
          >
            {e.remove}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="check"
            disabled={!selectedCells.some((c) => !c.isActive)}
            onClick={() => {
              change(activate(rows, selection));
            }}
          >
            {e.activate}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            disabled={selection.size === 0}
            onClick={() => {
              change(addSeatsAfter(rows, selection));
            }}
          >
            {e.addSeat}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            onClick={() => {
              change(addRow(rows));
            }}
          >
            {e.addRow}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selection.size === 0}
            onClick={() => {
              setSelection(new Set());
              setAnchor(null);
            }}
          >
            {e.clear}
          </Button>
        </div>
        {message && (
          <p className={message.tone === 'error' ? styles.fieldError : styles.hint} role="alert">
            {message.text}
          </p>
        )}
      </section>

      <div className={styles.editorGrid}>
        <section className={styles.section} aria-label={e.title(layout.hall.name)}>
          <SeatMap2D
            map={map}
            selected={[...selection]}
            selectTaken
            describe={describe}
            onToggle={(seat, { shiftKey }) => {
              const next = new Set(selection);
              if (shiftKey && anchor)
                for (const key of rangeKeys(rows, anchor, seat.id)) next.add(key);
              else if (next.has(seat.id)) next.delete(seat.id);
              else next.add(seat.id);
              setSelection(next);
              setAnchor(seat.id);
              setNewLabel('');
            }}
            onSweep={(seat) => {
              if (!selection.has(seat.id)) setSelection(new Set([...selection, seat.id]));
            }}
          />
        </section>
        <aside className={styles.section} aria-label={e.blockedTitle}>
          <h2 className={styles.sectionTitle}>{e.blockedTitle}</h2>
          {blockers.length === 0 ? (
            <p className={styles.hint}>{e.blockedNone}</p>
          ) : (
            <ul className={styles.blockers}>
              {blockers.map((cell) => (
                <li key={cell.key}>
                  <strong>{nameOf(cell.key)}</strong>:{' '}
                  {cell.blockedBy
                    .map(
                      (b) =>
                        `${pickText(locale, b.movieTitleSq, b.movieTitleEn)}, ${when(b.startsAt)}`,
                    )
                    .join('; ')}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <section className={styles.section} aria-label={e.preview3d(layout.hall.name)}>
        <div className={styles.actions}>
          <Button
            size="sm"
            variant="secondary"
            icon={show3d ? 'eyeOff' : 'eye'}
            aria-expanded={show3d}
            onClick={() => {
              setShow3d((v) => !v);
            }}
          >
            {show3d ? e.hide3d : e.show3d}
          </Button>
        </div>
        {show3d && (
          <div className={styles.preview3d}>
            <Suspense fallback={<Skeleton shape="rect" height="100%" />}>
              <Hall3D
                map={map}
                selected={[...selection]}
                viewSeat={null}
                onView={noop}
                onArrive={noop}
                onStep={noop}
                onLook={noop}
                resetSignal={0}
                recenterSignal={0}
                reducedMotion={reducedMotion}
                tooltip={describe}
                label={e.preview3d(layout.hall.name)}
                lookLabel={e.preview3d(layout.hall.name)}
              />
            </Suspense>
          </div>
        )}
      </section>
    </div>
  );
}
