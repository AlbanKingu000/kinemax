// Step "Ushqimi & pijet" (optional): the cinema's menu, quantities per item, pickup at the counter
// or (VIP/suite halls) delivery to the seat before or during the film. Every change is saved to
// the hold; the server prices it and returns the totals.
import {
  bookingResponseSchema,
  MAX_FOOD_ITEMS_PER_BOOKING,
  MAX_FOOD_QUANTITY_PER_ITEM,
  menuResponseSchema,
  type Booking,
  type Fulfillment,
  type MenuItem,
  type SeatMapResponse,
  type ServeTiming,
} from '@kinemax/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError, apiRequest } from '../api/http';
import { Button } from '../components/Button/Button';
import { RadioGroup } from '../components/Choice/Radio';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { QuantityStepper } from '../components/QuantityStepper/QuantityStepper';
import { Skeleton } from '../components/Skeleton/Skeleton';
import { Tabs } from '../components/Tabs/Tabs';
import { useAsync } from '../hooks/use-async';
import { formatPrice } from '../i18n/format';
import { pickText } from '../i18n/messages';
import { useLocale, useMessages } from '../i18n/use-messages';
import { useSecondsLeft } from './countdown';
import styles from './FoodStep.module.css';
import { CurrentHold, HoldExpired, HoldTimer } from './hold';

/** Quantity changes are saved this long after the last click (one request for several clicks). */
const SAVE_DELAY_MS = 350;

export function FoodStep({ map }: { map: SeatMapResponse }) {
  return (
    <CurrentHold showtimeId={map.showtime.id}>
      {(booking) => <FoodOrder initial={booking} map={map} />}
    </CurrentHold>
  );
}

interface Order {
  quantities: ReadonlyMap<string, number>;
  fulfillment: Fulfillment;
  serveTiming: ServeTiming;
}

function orderOf(booking: Booking): Order {
  const quantities = new Map<string, number>();
  for (const line of booking.food) {
    quantities.set(line.menuItemId, (quantities.get(line.menuItemId) ?? 0) + line.quantity);
  }
  const first = booking.food[0];
  return {
    quantities,
    fulfillment: first?.fulfillment ?? 'PICKUP_AT_COUNTER',
    serveTiming: first?.serveTiming ?? 'BEFORE_SHOW',
  };
}

const itemsIn = (order: Order) => [...order.quantities.values()].reduce((a, b) => a + b, 0);

function FoodOrder({ initial, map }: { initial: Booking; map: SeatMapResponse }) {
  const t = useMessages();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const showtimeId = map.showtime.id;
  const slug = map.location.slug;
  const menu = useAsync(
    (signal) =>
      apiRequest(`/api/locations/${slug}/menu?showtime=${showtimeId}`, {
        schema: menuResponseSchema,
        signal,
      }),
    `${slug}/${showtimeId}`,
  );
  const [booking, setBooking] = useState(initial);
  const [order, setOrder] = useState(() => orderOf(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [gone, setGone] = useState(false);
  const latest = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Order | null>(null);
  const secondsLeft = useSecondsLeft(booking.holdExpiresAt, booking.serverNow);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const seatDelivery = menu.status === 'ready' && menu.data.seatDelivery === true;

  async function save(next: Order): Promise<boolean> {
    pending.current = null;
    const request = ++latest.current;
    setSaving(true);
    setError('');
    const delivery = seatDelivery && next.fulfillment === 'DELIVER_TO_SEAT';
    try {
      const result = await apiRequest(`/api/bookings/${booking.id}/food`, {
        method: 'PUT',
        body: {
          items: [...next.quantities]
            .filter(([, quantity]) => quantity > 0)
            .map(([menuItemId, quantity]) => ({
              menuItemId,
              quantity,
              ...(delivery
                ? { fulfillment: 'DELIVER_TO_SEAT', serveTiming: next.serveTiming }
                : { fulfillment: 'PICKUP_AT_COUNTER' }),
            })),
        },
        schema: bookingResponseSchema,
      });
      if (request === latest.current) setBooking(result.booking);
      return true;
    } catch (caught) {
      if (caught instanceof ApiRequestError && (caught.status === 410 || caught.status === 409)) {
        setGone(true);
      } else if (request === latest.current) {
        setError(t.food.saveError);
      }
      return false;
    } finally {
      if (request === latest.current) setSaving(false);
    }
  }

  /** Shows the change at once and saves it a moment later. */
  function change(next: Order) {
    setOrder(next);
    pending.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void save(next);
    }, SAVE_DELAY_MS);
  }

  /** Saves `next` (or a change still waiting for its delay), then moves on. */
  async function leave(next: Order | null, then: () => void) {
    window.clearTimeout(timer.current);
    const toSave = next ?? pending.current;
    if (toSave && !(await save(toSave))) return;
    then();
  }
  const proceed = () => {
    void navigate(`/booking/${showtimeId}/pay`);
  };

  if (gone || secondsLeft <= 0) return <HoldExpired showtimeId={showtimeId} />;

  const chosen = itemsIn(order);
  const nameOf = (item: { nameSq: string; nameEn: string | null }) =>
    pickText(locale, item.nameSq, item.nameEn);
  const categories =
    menu.status === 'ready' ? [...new Set(menu.data.items.map((item) => item.category))] : [];

  function card(item: MenuItem) {
    const quantity = order.quantities.get(item.id) ?? 0;
    const name = nameOf(item);
    return (
      <li key={item.id} className={styles.card} data-chosen={quantity > 0 || undefined}>
        {item.imagePath && (
          <img
            className={styles.image}
            src={item.imagePath}
            alt=""
            width={480}
            height={360}
            loading="lazy"
          />
        )}
        <div className={styles.cardBody}>
          <h3 className={styles.name}>{name}</h3>
          {item.descriptionSq && (
            <p className={styles.description}>
              {pickText(locale, item.descriptionSq, item.descriptionEn)}
            </p>
          )}
          {item.components.length > 0 && (
            <p className={styles.contents}>
              <span className={styles.containsLabel}>{t.food.contains}:</span>{' '}
              {item.components.map((c) => t.food.component(c.quantity, nameOf(c))).join(', ')}
            </p>
          )}
          <div className={styles.cardFooter}>
            <span className={styles.price}>{formatPrice(locale, item.priceCents)}</span>
            <QuantityStepper
              value={quantity}
              itemName={name}
              max={Math.min(
                MAX_FOOD_QUANTITY_PER_ITEM,
                MAX_FOOD_ITEMS_PER_BOOKING - chosen + quantity,
              )}
              onChange={(value) => {
                const quantities = new Map(order.quantities);
                if (value > 0) quantities.set(item.id, value);
                else quantities.delete(item.id);
                change({ ...order, quantities });
              }}
            />
          </div>
        </div>
      </li>
    );
  }

  return (
    <section aria-labelledby="food-title" className={styles.step}>
      <div className={styles.header}>
        <h2 id="food-title" className={styles.title}>
          {t.food.title}
        </h2>
        <HoldTimer secondsLeft={secondsLeft} />
      </div>
      <div className={styles.intro}>
        <p className={styles.note}>{t.food.intro}</p>
        <Button
          variant="secondary"
          size="lg"
          disabled={saving}
          onClick={() =>
            void leave(chosen > 0 ? { ...order, quantities: new Map() } : null, proceed)
          }
        >
          {t.food.skip}
        </Button>
      </div>

      <div className={styles.layout}>
        <div className={styles.menu}>
          {seatDelivery && (
            <div className={styles.options}>
              <RadioGroup
                legend={t.food.fulfillmentLegend}
                name="fulfillment"
                inline
                value={order.fulfillment}
                options={[
                  { value: 'PICKUP_AT_COUNTER', label: t.food.pickup },
                  { value: 'DELIVER_TO_SEAT', label: t.food.deliver },
                ]}
                onChange={(fulfillment) => {
                  change({ ...order, fulfillment });
                }}
              />
              {order.fulfillment === 'DELIVER_TO_SEAT' && (
                <RadioGroup
                  legend={t.food.timingLegend}
                  name="serve-timing"
                  inline
                  value={order.serveTiming}
                  options={[
                    { value: 'BEFORE_SHOW', label: t.food.beforeShow },
                    { value: 'DURING_SHOW', label: t.food.duringShow },
                  ]}
                  onChange={(serveTiming) => {
                    change({ ...order, serveTiming });
                  }}
                />
              )}
            </div>
          )}

          {menu.status === 'loading' ? (
            <div aria-busy="true">
              <p role="status" className="visually-hidden">
                {t.common.loading}
              </p>
              <Skeleton shape="rect" height="20rem" />
            </div>
          ) : menu.status === 'error' ? (
            <EmptyState
              icon="warning"
              tone="error"
              title={t.food.menuError}
              action={
                <Button variant="secondary" onClick={menu.retry}>
                  {t.common.retry}
                </Button>
              }
            />
          ) : categories.length === 0 ? (
            <EmptyState icon="info" title={t.food.menuEmpty} />
          ) : (
            <Tabs
              label={t.food.categoriesLabel}
              className={styles.tabs}
              tabs={categories.map((category) => ({
                id: category,
                label: t.food.categories[category],
                content: (
                  <ul className={styles.grid}>
                    {menu.data.items.filter((i) => i.category === category).map(card)}
                  </ul>
                ),
              }))}
            />
          )}
        </div>

        <aside className={styles.summary} aria-labelledby="food-order-title">
          <h3 id="food-order-title" className={styles.summaryTitle}>
            {t.food.yourOrder}
          </h3>
          {booking.food.length === 0 ? (
            <p className={styles.note}>{t.food.nothingYet}</p>
          ) : (
            <ul className={styles.lines}>
              {booking.food.map((line) => (
                <li key={`${line.menuItemId}:${line.fulfillment}`}>
                  <span>{t.food.line(line.quantity, nameOf(line))}</span>
                  <span>{formatPrice(locale, line.totalCents)}</span>
                </li>
              ))}
            </ul>
          )}
          {booking.food.length > 0 && (
            <p className={styles.note}>
              {booking.food[0]?.fulfillment === 'DELIVER_TO_SEAT'
                ? `${t.food.deliver} · ${booking.food[0].serveTiming === 'DURING_SHOW' ? t.food.duringShow : t.food.beforeShow}`
                : t.food.pickupNote}
            </p>
          )}
          {chosen >= MAX_FOOD_ITEMS_PER_BOOKING && (
            <p className={styles.note}>{t.food.limit(MAX_FOOD_ITEMS_PER_BOOKING)}</p>
          )}
          <div className={styles.totals} aria-live="polite" aria-busy={saving}>
            <p className={styles.line}>
              <span>{t.tickets.title}</span>
              <span>{formatPrice(locale, booking.ticketsCents)}</span>
            </p>
            <p className={styles.line}>
              <span>{t.food.foodTotal}</span>
              <span>{formatPrice(locale, booking.foodCents)}</span>
            </p>
            <p className={styles.total}>
              <span>{t.tickets.total}</span>
              <strong>{formatPrice(locale, booking.totalCents)}</strong>
            </p>
          </div>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <Button
              variant="ghost"
              onClick={() =>
                void leave(null, () => {
                  void navigate(`/booking/${showtimeId}/tickets`);
                })
              }
            >
              {t.food.backToTickets}
            </Button>
            <Button disabled={saving} onClick={() => void leave(null, proceed)}>
              {t.seats.continue}
            </Button>
          </div>
        </aside>
      </div>
    </section>
  );
}
