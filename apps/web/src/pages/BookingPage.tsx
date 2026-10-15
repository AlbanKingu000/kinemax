import {
  bookingResponseSchema,
  currentBookingResponseSchema,
  type SeatMapResponse,
  type SeatMapSeat,
} from '@kinemax/shared';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiRequestError, apiRequest } from '../api/http';
import { useAuth } from '../auth/auth-context';
import { authErrorMessage } from '../auth/auth-errors';
import { loginPath } from '../auth/next-path';
import {
  keepAvailable,
  readSelection,
  readViewMode,
  storeSelection,
  storeViewMode,
  ticketCount,
  toggleSeat,
  MAX_TICKETS,
} from '../booking/selection';
import { FoodStep } from '../booking/FoodStep';
import { SeatMap2D } from '../booking/SeatMap2D';
import { neighbourSeat, screenDistance } from '../booking/seat-view';
import { TicketsStep } from '../booking/TicketsStep';
import { useAutoHide, useLookHint } from '../booking/use-auto-hide';
import { canRender3D, useSeatMap } from '../booking/use-seat-map';
import { AgeBadge, FormatBadge, LanguageBadge } from '../components/Badge/Badge';
import { Button, ButtonLink } from '../components/Button/Button';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { Container } from '../components/Layout/Layout';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { usePageMeta } from '../hooks/use-page-meta';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { formatLongDate, formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useLocationChoice } from '../location/location-context';
import styles from './BookingPage.module.css';

// The 3D hall is a separate chunk: three.js only loads on this page, and only when 3D is shown.
const Hall3D = lazy(() => import('../booking/Hall3D'));

/**
 * Booking one show. Step "seats": 3D hall or 2D map, a summary panel and "Vazhdo". Step "tickets":
 * the held seats with ticket categories and server prices (signed in only).
 */
export function BookingPage({ step = 'seats' }: { step?: 'seats' | 'tickets' | 'food' }) {
  const t = useMessages();
  const { showtimeId = '' } = useParams();
  const { status } = useAuth();
  const navigate = useNavigate();
  const seatMap = useSeatMap(showtimeId);
  // The header follows the cinema of the show being booked (saved like a choice in the picker).
  const { selected: chosenLocation, choose } = useLocationChoice();
  const showLocation = seatMap.status === 'ready' ? seatMap.data.location.slug : undefined;
  useEffect(() => {
    if (showLocation && chosenLocation?.slug !== showLocation) choose(showLocation);
  }, [showLocation, chosenLocation?.slug, choose]);
  usePageMeta(
    `${step === 'tickets' ? t.tickets.title : step === 'food' ? t.food.title : t.seats.title} · ${t.meta.titleSuffix}`,
    t.booking.seatsSoonBody,
  );

  // Signed in with a live hold for this show: resume it instead of showing the map (the map would
  // show the user's own held seats as taken).
  const [resumeChecked, setResumeChecked] = useState<string | null>(null);
  useEffect(() => {
    if (step !== 'seats' || status !== 'authenticated') return;
    const controller = new AbortController();
    apiRequest('/api/bookings/current', {
      schema: currentBookingResponseSchema,
      signal: controller.signal,
    }).then(
      ({ booking }) => {
        if (booking?.showtimeId === showtimeId) {
          void navigate(`/booking/${showtimeId}/tickets`, { replace: true });
        } else {
          setResumeChecked(showtimeId);
        }
      },
      () => {
        if (!controller.signal.aborted) setResumeChecked(showtimeId);
      },
    );
    return () => {
      controller.abort();
    };
  }, [step, status, showtimeId, navigate]);
  const checking =
    step === 'seats' &&
    (status === 'loading' || (status === 'authenticated' && resumeChecked !== showtimeId));

  if (seatMap.status === 'loading' || (seatMap.status === 'ready' && checking)) {
    return (
      <Container className={styles.page}>
        <div aria-busy="true">
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="24rem" />
        </div>
      </Container>
    );
  }
  if (seatMap.status === 'error') {
    const error = seatMap.error instanceof ApiRequestError ? seatMap.error : undefined;
    const started = error?.status === 410;
    const missing = error?.status === 404 || error?.status === 400;
    return (
      <Container narrow className={styles.page}>
        <EmptyState
          icon={started ? 'clock' : missing ? 'search' : 'warning'}
          tone={started || missing ? 'neutral' : 'error'}
          headingLevel="h1"
          title={
            started ? t.seats.startedTitle : missing ? t.booking.notFoundTitle : t.seats.loadError
          }
          action={
            started || missing ? (
              <ButtonLink to="/schedule" icon="calendar">
                {t.booking.backToSchedule}
              </ButtonLink>
            ) : (
              <Button variant="secondary" onClick={seatMap.refresh}>
                {t.common.retry}
              </Button>
            )
          }
        >
          <p>{started ? t.booking.startedBody : missing ? t.booking.notFoundBody : null}</p>
        </EmptyState>
      </Container>
    );
  }
  return (
    <Container className={styles.page}>
      <ShowSummary map={seatMap.data} />
      {step === 'tickets' ? (
        <TicketsStep map={seatMap.data} />
      ) : step === 'food' ? (
        <FoodStep map={seatMap.data} />
      ) : (
        <SeatSelection map={seatMap.data} onRefresh={seatMap.refresh} />
      )}
    </Container>
  );
}

function ShowSummary({ map }: { map: SeatMapResponse }) {
  const t = useMessages();
  const { locale } = useLocale();
  return (
    <header className={styles.summary}>
      {map.movie.posterPath && (
        <img className={styles.poster} src={map.movie.posterPath} alt="" width={600} height={900} />
      )}
      <div className={styles.summaryText}>
        <h1 className={styles.title}>{pickText(locale, map.movie.titleSq, map.movie.titleEn)}</h1>
        <div className={styles.badges}>
          <AgeBadge rating={map.movie.ageRating} />
          <FormatBadge format={map.showtime.format} />
          <LanguageBadge version={map.showtime.languageVersion} />
        </div>
        <p className={styles.meta}>
          {map.location.name} · {map.hall.name} (
          {pickText(locale, map.hall.hallType.nameSq, map.hall.hallType.nameEn)})
          <br />
          {formatLongDate(locale, t, map.showtime.date)} · {map.showtime.startTime}
        </p>
      </div>
    </header>
  );
}

function SeatSelection({ map, onRefresh }: { map: SeatMapResponse; onRefresh: () => void }) {
  const t = useMessages();
  const { locale } = useLocale();
  const { status } = useAuth();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const showtimeId = map.showtime.id;
  const seatsById = useMemo(() => new Map(map.seats.map((s) => [s.id, s])), [map.seats]);
  const supports3D = useMemo(() => canRender3D(), []);
  const [mode, setModeState] = useState<'3d' | '2d'>(() =>
    supports3D &&
    (readViewMode() ?? (window.matchMedia('(min-width: 1024px)').matches ? '3d' : '2d')) === '3d'
      ? '3d'
      : '2d',
  );
  const setMode = (next: '3d' | '2d') => {
    setModeState(next);
    storeViewMode(next);
  };
  const [selection, setSelection] = useState(() => readSelection(showtimeId));
  const [notice, setNotice] = useState('');
  const [viewSeat, setViewSeat] = useState<SeatMapSeat | null>(null);
  // The seat the camera has arrived at: the seat view overlay shows only after the glide.
  const [seated, setSeated] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [recenterSignal, setRecenterSignal] = useState(0);
  const prevButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  // While the user looks around, the seat-view panel and the hint step aside.
  const { hidden: panelHidden, look, panelProps } = useAutoHide();
  const showHint = useLookHint(viewSeat !== null && seated !== null);
  const [holding, setHolding] = useState(false);

  // On load and after every refresh: drop chosen seats that were taken in the meantime.
  const [checkedMap, setCheckedMap] = useState<SeatMapResponse | null>(null);
  if (checkedMap !== map) {
    setCheckedMap(map);
    const { kept, dropped } = keepAvailable(selection.seatIds, seatsById);
    const suiteGone = selection.wholeHall && (map.wholeHall?.taken ?? true);
    if (dropped.length > 0 || suiteGone) {
      setSelection({ seatIds: kept, wholeHall: selection.wholeHall && !suiteGone });
      setNotice(t.seats.droppedTaken(dropped.length || 1));
    }
  }
  useEffect(() => {
    storeSelection(showtimeId, selection);
  }, [showtimeId, selection]);

  const chosen = selection.seatIds.map((id) => seatsById.get(id)).filter((s) => s !== undefined);
  const total = map.hall.wholeHallOnly
    ? selection.wholeHall
      ? (map.wholeHall?.priceCents ?? 0)
      : 0
    : chosen.reduce((sum, seat) => sum + (map.prices[seat.type] ?? 0), 0);
  const tickets = ticketCount(chosen);
  const typeName = (seat: SeatMapSeat) => t.seats.types[seat.type];

  function toggle(seat: SeatMapSeat) {
    const result = toggleSeat(selection.seatIds, seat, seatsById);
    if (!result.ok) {
      setNotice(result.reason === 'limit' ? t.seats.limit(MAX_TICKETS) : t.seats.droppedTaken(1));
      return;
    }
    setSelection({ seatIds: result.selected, wholeHall: false });
    const added = result.selected.length > selection.seatIds.length;
    setNotice(added && seat.type === 'WHEELCHAIR' ? t.seats.wheelchairNote : '');
  }

  async function onContinue() {
    if (status !== 'authenticated') {
      storeSelection(showtimeId, selection);
      void navigate(loginPath(`/booking/${showtimeId}`));
      return;
    }
    // The server holds the seats for a few minutes; prices and availability are decided there.
    setHolding(true);
    setNotice(t.tickets.holding);
    try {
      await apiRequest('/api/bookings/hold', {
        method: 'POST',
        body: map.hall.wholeHallOnly
          ? { showtimeId, wholeHall: true }
          : { showtimeId, seatIds: selection.seatIds },
        schema: bookingResponseSchema,
      });
      void navigate(`/booking/${showtimeId}/tickets`);
    } catch (error) {
      setHolding(false);
      if (error instanceof ApiRequestError && error.status === 409) {
        const taken = new Set(error.takenSeatIds);
        setSelection({
          seatIds: selection.seatIds.filter((id) => !taken.has(id)),
          wholeHall: false,
        });
        setNotice(map.hall.wholeHallOnly ? t.tickets.suiteTaken : t.tickets.seatsTaken);
        onRefresh();
      } else if (error instanceof ApiRequestError && error.status === 410) {
        setNotice(t.seats.startedTitle);
      } else {
        setNotice(authErrorMessage(t, error));
      }
    }
  }

  function closeSeatView() {
    setViewSeat(null);
    setSeated(null);
  }

  /** Glides to the neighbouring seat in the row; at the row end that button turns off. */
  function step(direction: -1 | 1) {
    if (!viewSeat || seated === null) return;
    const next = neighbourSeat(map.seats, viewSeat, direction);
    if (!next) return;
    setViewSeat(next);
    const button = direction < 0 ? prevButton.current : nextButton.current;
    if (!neighbourSeat(map.seats, next, direction) && document.activeElement === button) {
      (direction < 0 ? nextButton.current : prevButton.current)?.focus();
    }
  }

  const nothing = map.hall.wholeHallOnly ? !selection.wholeHall : chosen.length === 0;
  const legend = (['STANDARD', 'VIP', 'COUPLE', 'WHEELCHAIR', 'COMPANION'] as const).filter(
    (type) => map.seats.some((s) => s.type === type),
  );

  return (
    <>
      <div className={styles.layout}>
        <section aria-labelledby="seats-title" className={styles.stage}>
          <div className={styles.stageHeader}>
            <h2 id="seats-title" className={styles.stageTitle}>
              {map.hall.wholeHallOnly ? t.seats.suiteTitle : t.seats.title}
            </h2>
            {supports3D && (
              <div role="group" aria-label={t.seats.viewMode} className={styles.toggle}>
                {(['3d', '2d'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => {
                      setMode(m);
                      if (m === '2d') closeSeatView();
                    }}
                  >
                    {m === '3d' ? t.seats.view3d : t.seats.view2d}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!supports3D && <p className={styles.note}>{t.seats.no3d}</p>}

          {/* Suites: the 3D room is for looking only; the suite is booked as a whole below. */}
          {mode === '3d' ? (
            <div className={styles.hall}>
              <Suspense
                fallback={
                  <div aria-busy="true" className={styles.hallLoading}>
                    <p role="status">{t.seats.loading3d}</p>
                  </div>
                }
              >
                <Hall3D
                  map={map}
                  selected={selection.seatIds}
                  viewSeat={viewSeat}
                  onView={setViewSeat}
                  onArrive={setSeated}
                  onStep={step}
                  onLook={look}
                  resetSignal={resetSignal}
                  recenterSignal={recenterSignal}
                  reducedMotion={reducedMotion}
                  label={t.seats.hallLabel(map.hall.name)}
                  lookLabel={t.seats.lookLabel}
                  tooltip={(seat) => {
                    const price = map.prices[seat.type];
                    return `${t.seats.rowSeat(seat.row, seat.number)} · ${typeName(seat)}${price !== undefined ? ` · ${formatPrice(locale, price)}` : ''}`;
                  }}
                />
              </Suspense>
              {viewSeat && seated !== null ? (
                <>
                  {showHint && (
                    <p className={styles.lookHint} data-hidden={panelHidden || undefined}>
                      {t.seats.lookHint}
                    </p>
                  )}
                  {/* While the panel is hidden: where am I (the panel itself stays readable) */}
                  <p
                    className={styles.seatTag}
                    data-shown={panelHidden || undefined}
                    aria-hidden="true"
                  >
                    {viewSeat.row}
                    {viewSeat.number}
                  </p>
                  <div
                    className={styles.overlay}
                    role="dialog"
                    aria-label={t.seats.overlay(viewSeat.row, viewSeat.number, typeName(viewSeat))}
                    data-hidden={panelHidden || undefined}
                    {...panelProps}
                  >
                    <div className={styles.overlayText}>
                      <p className={styles.overlayTitle} aria-live="polite">
                        {t.seats.overlay(viewSeat.row, viewSeat.number, typeName(viewSeat))}
                      </p>
                      <p className={styles.overlayDistance}>
                        {t.seats.distance(Math.round(screenDistance(viewSeat, map.hall.screen)))}
                      </p>
                    </div>
                    <div className={styles.overlayActions}>
                      {map.hall.wholeHallOnly ? null : viewSeat.status === 'AVAILABLE' ||
                        selection.seatIds.includes(viewSeat.id) ? (
                        <Button
                          size="sm"
                          variant={
                            selection.seatIds.includes(viewSeat.id) ? 'secondary' : 'primary'
                          }
                          onClick={() => {
                            toggle(viewSeat);
                          }}
                        >
                          {selection.seatIds.includes(viewSeat.id)
                            ? t.seats.removeThis
                            : t.seats.selectThis}
                        </Button>
                      ) : (
                        <p className={styles.note}>{t.seats.taken}</p>
                      )}
                      <Button
                        ref={prevButton}
                        size="sm"
                        variant="icon"
                        icon="chevronLeft"
                        aria-label={t.seats.prevSeat}
                        title={t.seats.prevSeat}
                        disabled={!neighbourSeat(map.seats, viewSeat, -1)}
                        onClick={() => {
                          step(-1);
                        }}
                      />
                      <Button
                        ref={nextButton}
                        size="sm"
                        variant="icon"
                        icon="chevronRight"
                        aria-label={t.seats.nextSeat}
                        title={t.seats.nextSeat}
                        disabled={!neighbourSeat(map.seats, viewSeat, 1)}
                        onClick={() => {
                          step(1);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRecenterSignal((n) => n + 1);
                        }}
                      >
                        {t.seats.lookAtScreen}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          closeSeatView();
                        }}
                      >
                        {t.seats.backToHall}
                      </Button>
                    </div>
                  </div>
                </>
              ) : viewSeat ? null : (
                <Button
                  size="sm"
                  variant="secondary"
                  className={styles.reset}
                  onClick={() => {
                    setResetSignal((n) => n + 1);
                  }}
                >
                  {t.seats.resetView}
                </Button>
              )}
            </div>
          ) : map.hall.wholeHallOnly ? null : (
            <>
              <SeatMap2D
                map={map}
                selected={selection.seatIds}
                onToggle={toggle}
                onView={
                  supports3D
                    ? (seat) => {
                        setMode('3d');
                        setViewSeat(seat);
                      }
                    : undefined
                }
              />
              {supports3D && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={styles.open3d}
                  onClick={() => {
                    setMode('3d');
                  }}
                >
                  {t.seats.open3d}
                </Button>
              )}
            </>
          )}
          {map.hall.wholeHallOnly && (
            <SuiteCard
              map={map}
              selected={selection.wholeHall}
              onToggle={() => {
                setSelection({ seatIds: [], wholeHall: !selection.wholeHall });
              }}
            />
          )}
        </section>

        <aside className={styles.panel} aria-labelledby="panel-title">
          <h2 id="panel-title" className={styles.panelTitle}>
            {t.seats.yourSeats}
          </h2>
          {map.hall.wholeHallOnly ? (
            <p>{selection.wholeHall ? t.seats.suiteSelected : t.seats.noneSelected}</p>
          ) : chosen.length === 0 ? (
            <p className={styles.note}>{t.seats.noneSelected}</p>
          ) : (
            <ul className={styles.chosen}>
              {chosen.map((seat) => (
                <li key={seat.id}>
                  <span>
                    {t.seats.rowSeat(seat.row, seat.number)} · {typeName(seat)}
                  </span>
                  <span>
                    {map.prices[seat.type] !== undefined
                      ? formatPrice(locale, map.prices[seat.type] ?? 0)
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.total}>
            <span>
              {t.seats.estimated}
              {!map.hall.wholeHallOnly && tickets > 0 ? ` · ${t.seats.tickets(tickets)}` : ''}
            </span>
            <strong>{formatPrice(locale, total)}</strong>
          </div>
          <p className={styles.note}>{t.seats.finalNote}</p>
          <p role="status" aria-live="polite" className={styles.notice}>
            {notice}
          </p>
          <Button
            size="lg"
            className={styles.continue}
            disabled={nothing || holding}
            onClick={() => void onContinue()}
          >
            {t.seats.continue}
          </Button>
          {!map.hall.wholeHallOnly && (
            <div className={styles.legend}>
              <p className={styles.legendTitle}>{t.seats.legend}</p>
              <ul>
                {legend.map((type) => (
                  <li key={type}>
                    <span className={styles.swatch} data-type={type} aria-hidden="true" />
                    {t.seats.types[type]}
                    {map.prices[type] !== undefined
                      ? ` · ${formatPrice(locale, map.prices[type] ?? 0)}`
                      : ''}
                  </li>
                ))}
                <li>
                  <span className={styles.swatch} data-type="SELECTED" aria-hidden="true" />
                  {t.seats.selected}
                </li>
                <li>
                  <span className={styles.swatch} data-type="TAKEN" aria-hidden="true" />
                  {t.seats.taken}
                </li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Phones: the essentials stay in reach at the bottom of the screen */}
      <div className={styles.bottomBar}>
        <span>
          {formatPrice(locale, total)}
          {tickets > 0 ? ` · ${t.seats.tickets(tickets)}` : ''}
        </span>
        <Button size="md" disabled={nothing || holding} onClick={() => void onContinue()}>
          {t.seats.continue}
        </Button>
      </div>
    </>
  );
}

function SuiteCard({
  map,
  selected,
  onToggle,
}: {
  map: SeatMapResponse;
  selected: boolean;
  onToggle: () => void;
}) {
  const t = useMessages();
  const { locale } = useLocale();
  const taken = map.wholeHall?.taken ?? true;
  return (
    <div className={styles.suite}>
      <p>{t.seats.suiteBody}</p>
      {map.wholeHall?.priceCents != null && (
        <p className={styles.suitePrice}>{formatPrice(locale, map.wholeHall.priceCents)}</p>
      )}
      {taken ? (
        <p className={styles.note}>{t.seats.suiteTaken}</p>
      ) : (
        <Button
          size="lg"
          variant={selected ? 'secondary' : 'primary'}
          aria-pressed={selected}
          onClick={onToggle}
        >
          {selected ? t.seats.suiteSelected : t.seats.bookSuite}
        </Button>
      )}
    </div>
  );
}
