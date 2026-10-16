import type { StatsRange, StatsResponse } from '@kinemax/shared';
import { useState } from 'react';
import { fetchStats } from '../api/admin';
import { localDateTime } from '../booking/ticket-format';
import { BarList } from '../components/BarList/BarList';
import { Button } from '../components/Button/Button';
import { Chip } from '../components/Chip/Chip';
import { ColumnChart } from '../components/ColumnChart/ColumnChart';
import { DataTable } from '../components/DataTable/DataTable';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { FillBar } from '../components/FillBar/FillBar';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { StatTile } from '../components/StatTile/StatTile';
import { useAsync } from '../hooks/use-async';
import { useAdminMessages } from '../i18n/admin-messages';
import { formatReleaseDate, pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useAdminLocation } from './admin-location';
import styles from './DashboardPage.module.css';
import { formatEuros, formatMoney, percent } from './format';

const RANGES: readonly StatsRange[] = ['today', '7d', '30d'];

/** The admin home: key figures, revenue by day, hall types, top movies and the next shows. */
export function DashboardPage() {
  const a = useAdminMessages();
  const t = useMessages();
  const { selectedId, selected } = useAdminLocation();
  const [range, setRange] = useState<StatsRange>('today');
  const state = useAsync(
    (signal) => fetchStats(selectedId, range, signal),
    `stats:${selectedId ?? 'all'}:${range}`,
  );

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{a.dashboard.title}</h1>
          <p className={styles.scope}>{a.dashboard.scope(selected?.name ?? null)}</p>
        </div>
        <div role="group" aria-label={a.dashboard.range} className={styles.ranges}>
          {RANGES.map((value) => (
            <Chip
              key={value}
              label={a.dashboard.ranges[value]}
              selected={range === value}
              onToggle={() => {
                setRange(value);
              }}
            />
          ))}
        </div>
      </header>

      {state.status === 'loading' && (
        <div aria-busy="true" className={styles.loading}>
          <p role="status" className="visually-hidden">
            {t.common.loading}
          </p>
          <Skeleton shape="rect" height="6rem" />
          <Skeleton shape="rect" height="16rem" />
        </div>
      )}
      {state.status === 'error' && (
        <EmptyState
          icon="warning"
          tone="error"
          title={a.dashboard.loadError}
          action={<Button onClick={state.retry}>{t.common.retry}</Button>}
        />
      )}
      {state.status === 'ready' && <Dashboard stats={state.data} showCinema={!selected} />}
    </div>
  );
}

function Dashboard({ stats, showCinema }: { stats: StatsResponse; showCinema: boolean }) {
  const a = useAdminMessages();
  const { locale } = useLocale();
  const money = (cents: number) => formatMoney(locale, cents);
  const { revenue, occupancy } = stats;
  const today = localDateTime(new Date().toISOString(), stats.timeZone).date;

  return (
    <>
      <section className={styles.tiles} aria-label={a.dashboard.title}>
        <StatTile
          label={a.dashboard.revenue}
          value={money(revenue.totalCents)}
          detail={
            <>
              {a.dashboard.revenueSplit(money(revenue.ticketsCents), money(revenue.foodCents))}
              {revenue.refundsCents > 0 && (
                <>
                  <br />
                  {a.dashboard.refunds(money(revenue.refundsCents))}
                </>
              )}
            </>
          }
        />
        <StatTile label={a.dashboard.ticketsSold} value={String(stats.ticketsSold)} />
        <StatTile
          label={a.dashboard.occupancy}
          value={percent(occupancy.soldSeats, occupancy.capacity)}
          detail={a.dashboard.occupancyDetail(occupancy.soldSeats, occupancy.capacity)}
        />
        <StatTile
          label={a.dashboard.seatDelivery}
          value={String(stats.seatDeliveryOrdersToday)}
          detail={a.dashboard.seatDeliveryDetail}
        />
      </section>

      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.wide}`}>
          <ColumnChart
            title={a.dashboard.revenueChart}
            series={[
              { key: 'tickets', label: a.dashboard.tickets, slot: 1 },
              { key: 'food', label: a.dashboard.food, slot: 2 },
            ]}
            data={stats.daily.map((day) => ({
              label: formatReleaseDate(locale, day.date),
              short: String(Number(day.date.slice(8))),
              values: { tickets: day.ticketsCents, food: day.foodCents },
            }))}
            formatValue={(cents) => formatEuros(locale, cents)}
            minScale={10_000}
            categoryLabel={a.dashboard.day}
            totalLabel={a.dashboard.total}
          />
        </section>

        <section className={styles.panel} aria-labelledby="hall-types">
          <h2 id="hall-types" className={styles.panelTitle}>
            {a.dashboard.hallTypes}
          </h2>
          <BarList
            label={a.dashboard.hallTypes}
            items={stats.hallTypes.map((type) => ({
              key: type.code,
              label: pickText(locale, type.nameSq, type.nameEn),
              value: type.revenueCents,
              display: money(type.revenueCents),
              detail: a.dashboard.ticketCount(type.ticketsSold),
            }))}
          />
        </section>

        <section className={styles.panel} aria-labelledby="top-movies">
          <h2 id="top-movies" className={styles.panelTitle}>
            {a.dashboard.topMovies}
          </h2>
          {stats.topMovies.length === 0 ? (
            <p className={styles.empty}>{a.dashboard.noSales}</p>
          ) : (
            <BarList
              label={a.dashboard.topMovies}
              items={stats.topMovies.map((movie) => ({
                key: movie.movieId,
                label: pickText(locale, movie.titleSq, movie.titleEn),
                value: movie.revenueCents,
                display: money(movie.revenueCents),
                detail: a.dashboard.ticketCount(movie.ticketsSold),
              }))}
            />
          )}
        </section>
      </div>

      <section className={styles.upcoming}>
        {stats.upcoming.length === 0 ? (
          <>
            <h2 className={styles.panelTitle}>{a.dashboard.upcoming}</h2>
            <p className={styles.empty}>{a.dashboard.noUpcoming}</p>
          </>
        ) : (
          <DataTable caption={a.dashboard.upcoming}>
            <thead>
              <tr>
                <th scope="col">{a.dashboard.columns.time}</th>
                <th scope="col">{a.dashboard.columns.movie}</th>
                <th scope="col">{a.dashboard.columns.hall}</th>
                {showCinema && <th scope="col">{a.dashboard.columns.cinema}</th>}
                <th scope="col" data-align="end">
                  {a.dashboard.columns.seats}
                </th>
                <th scope="col">{a.dashboard.columns.fill}</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcoming.map((show) => {
                const { date, time } = localDateTime(show.startsAt, stats.timeZone);
                const when = date === today ? time : `${formatReleaseDate(locale, date)} ${time}`;
                const title = pickText(locale, show.movieTitleSq, show.movieTitleEn);
                return (
                  <tr key={show.showtimeId}>
                    <td data-align="end">{when}</td>
                    <th scope="row">{title}</th>
                    <td>{show.hallName}</td>
                    {showCinema && <td data-muted>{show.locationName}</td>}
                    <td data-align="end">
                      {show.soldSeats}/{show.capacity}
                    </td>
                    <td className={styles.fill}>
                      <FillBar
                        value={show.soldSeats}
                        max={show.capacity}
                        label={a.dashboard.fillOf(title, time)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </section>
    </>
  );
}
