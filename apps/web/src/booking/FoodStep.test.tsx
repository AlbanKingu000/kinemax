import type { Booking, FoodRequest, MenuItem, MenuResponse } from '@kinemax/shared';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCsrfToken } from '../api/http';
import { LOCATION_STORAGE_KEY } from '../location/location-storage';
import { stubAuth, testUser } from '../test/auth';
import { renderApp } from '../test/catalog';
import { BOOKING_ID, heldBooking, SHOWTIME_ID, standardMap } from '../test/seatmap';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  window.localStorage.setItem(LOCATION_STORAGE_KEY, 'prizren');
  setCsrfToken(null);
});

afterEach(() => {
  window.sessionStorage.clear();
});

const STEP_WAIT = { timeout: 5_000 };
const FOOD = `/booking/${SHOWTIME_ID}/food`;

const item = (id: string, extra: Partial<MenuItem>): MenuItem => ({
  id: `0190f0a0-0000-7000-8000-0000000001${id}`,
  slug: `item-${id}`,
  category: 'POPCORN',
  nameSq: `Artikulli ${id}`,
  nameEn: null,
  descriptionSq: null,
  descriptionEn: null,
  imagePath: `/seed/menu/item-${id}.svg`,
  priceCents: 350,
  isCombo: false,
  components: [],
  ...extra,
});

const popcorn = item('01', { nameSq: 'Kokoshka mesatare', priceCents: 350 });
const drink = item('02', { nameSq: 'Pije e gazuar', category: 'DRINK', priceCents: 200 });
const combo = item('03', {
  nameSq: 'Kombo klasike',
  category: 'COMBO',
  priceCents: 500,
  isCombo: true,
  descriptionSq: 'Kokoshka dhe pije.',
  components: [
    { slug: 'popcorn-medium', nameSq: 'Kokoshka mesatare', nameEn: null, quantity: 1 },
    { slug: 'soft-drink', nameSq: 'Pije e gazuar', nameEn: null, quantity: 2 },
  ],
});

/** A signed-in user with a hold; PUT /food is priced here from the menu, like the server does. */
function withFoodHold(
  seatDelivery: boolean,
  options: { failWith?: number; initial?: Booking } = {},
) {
  const map = standardMap();
  const menu: MenuResponse = {
    location: { slug: map.location.slug, name: map.location.name },
    items: [popcorn, drink, combo],
    seatDelivery,
  };
  let current = options.initial ?? heldBooking(map, [map.seats[0]?.id ?? '']);
  const fake = stubAuth(testUser(), {
    seatmap: { [map.showtime.id]: map },
    menu: { [map.location.slug]: menu },
    bookings: ({ method, path, body }) => {
      if (method === 'GET' && path === '/api/bookings/current') return { booking: current };
      if (method === 'PUT' && path === `/api/bookings/${BOOKING_ID}/food`) {
        if (options.failWith)
          return { status: options.failWith, body: { error: { code: 'gone', message: 'x' } } };
        const food = (body as FoodRequest).items.map((line) => {
          const offer = menu.items.find((i) => i.id === line.menuItemId);
          return {
            menuItemId: line.menuItemId,
            nameSq: offer?.nameSq ?? '',
            nameEn: null,
            quantity: line.quantity,
            unitPriceCents: offer?.priceCents ?? 0,
            totalCents: line.quantity * (offer?.priceCents ?? 0),
            fulfillment: line.fulfillment,
            serveTiming: line.serveTiming ?? null,
          };
        });
        const foodCents = food.reduce((sum, f) => sum + f.totalCents, 0);
        current = { ...current, food, foodCents, totalCents: current.ticketsCents + foodCents };
        return { booking: current };
      }
      return undefined;
    },
  });
  return { fake, map };
}

const foodPuts = (fake: ReturnType<typeof stubAuth>) =>
  fake.requests.filter((r) => r.method === 'PUT' && r.path.endsWith('/food'));

describe('Food & drinks step', () => {
  it('shows the menu by category and saves the order to the hold, priced by the server', async () => {
    const { fake } = withFoodHold(false);
    renderApp(FOOD);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ushqimi & pijet' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Koha e mbetur' })).toBeInTheDocument();
    const tabs = await screen.findByRole('tablist', { name: 'Kategoritë e menysë' }, STEP_WAIT);
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Popcorn', 'Pije', 'Kombo']);
    // No seat delivery in this hall: no pickup/delivery choice.
    expect(screen.queryByRole('group', { name: 'Si do ta marrësh?' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Më shumë: Kokoshka mesatare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Më shumë: Kokoshka mesatare' }));
    expect(screen.getByRole('status', { name: 'Kokoshka mesatare: 2' })).toHaveTextContent('2');
    await waitFor(() => {
      expect(foodPuts(fake)).toHaveLength(1);
    });
    // Two clicks, one request; no prices sent.
    expect(foodPuts(fake)[0]?.body).toEqual({
      items: [{ menuItemId: popcorn.id, quantity: 2, fulfillment: 'PICKUP_AT_COUNTER' }],
    });
    const summary = screen.getByRole('complementary', { name: 'Porosia jote' });
    expect(await within(summary).findByText('2 × Kokoshka mesatare')).toBeInTheDocument();
    expect(
      within(summary).getByText('Porosia të pret gati në banak; trego kodin e rezervimit.'),
    ).toBeInTheDocument();
    expect(within(summary).getByText('11,50 €')).toBeInTheDocument();

    // Combos list what they contain.
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Kombo' }));
    expect(screen.getByText('1 × Kokoshka mesatare, 2 × Pije e gazuar')).toBeInTheDocument();
    // The brand illustration is decorative (alt=""): the name is the card's heading.
    const panel = screen.getByRole('tabpanel', { name: 'Kombo' });
    expect(within(panel).getByRole('presentation')).toHaveAttribute('src', combo.imagePath);
    expect(within(panel).getByRole('heading', { level: 3, name: 'Kombo klasike' })).toBeVisible();
  });

  it('offers delivery to the seat in VIP/suite halls, before or during the film', async () => {
    const { fake } = withFoodHold(true);
    renderApp(FOOD);
    const how = await screen.findByRole('group', { name: 'Si do ta marrësh?' }, STEP_WAIT);
    expect(screen.queryByRole('group', { name: 'Kur ta sjellim?' })).not.toBeInTheDocument();
    fireEvent.click(within(how).getByRole('radio', { name: 'Na e sjellim te ulësja' }));
    const when = screen.getByRole('group', { name: 'Kur ta sjellim?' });
    expect(within(when).getByRole('radio', { name: 'Para filmit' })).toBeChecked();
    fireEvent.click(
      within(when).getByRole('radio', { name: 'Gjatë filmit (rreth 20 min pas fillimit)' }),
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Kombo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Më shumë: Kombo klasike' }));
    await waitFor(() => {
      expect(foodPuts(fake).at(-1)?.body).toEqual({
        items: [
          {
            menuItemId: combo.id,
            quantity: 1,
            fulfillment: 'DELIVER_TO_SEAT',
            serveTiming: 'DURING_SHOW',
          },
        ],
      });
    });
    expect(
      await screen.findByText('Na e sjellim te ulësja · Gjatë filmit (rreth 20 min pas fillimit)'),
    ).toBeInTheDocument();
  });

  it('can be skipped straight to the payment', async () => {
    const { fake } = withFoodHold(false);
    renderApp(FOOD);
    const skip = await screen.findByRole('button', { name: 'Kalo këtë hap' }, STEP_WAIT);
    await screen.findByRole('tablist', {}, STEP_WAIT);
    fireEvent.click(skip);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pagesa' }, STEP_WAIT),
    ).toBeInTheDocument();
    expect(foodPuts(fake)).toHaveLength(0);
  });

  it('removes an order already chosen when the step is skipped', async () => {
    const { fake } = withFoodHold(false);
    renderApp(FOOD);
    await screen.findByRole('tablist', {}, STEP_WAIT);
    fireEvent.click(screen.getByRole('button', { name: 'Më shumë: Kokoshka mesatare' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kalo këtë hap' }));
    await waitFor(() => {
      expect(foodPuts(fake).at(-1)?.body).toEqual({ items: [] });
    });
    expect(foodPuts(fake)).toHaveLength(1);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pagesa' }, STEP_WAIT),
    ).toBeInTheDocument();
  });

  it('resumes the food already on the hold', async () => {
    const map = standardMap();
    const base = heldBooking(map, [map.seats[0]?.id ?? '']);
    const initial: Booking = {
      ...base,
      food: [
        {
          menuItemId: drink.id,
          nameSq: drink.nameSq,
          nameEn: null,
          quantity: 3,
          unitPriceCents: 200,
          totalCents: 600,
          fulfillment: 'PICKUP_AT_COUNTER',
          serveTiming: null,
        },
      ],
      foodCents: 600,
      totalCents: base.ticketsCents + 600,
    };
    withFoodHold(false, { initial });
    renderApp(FOOD);
    fireEvent.click(await screen.findByRole('tab', { name: 'Pije' }, STEP_WAIT));
    expect(screen.getByRole('status', { name: 'Pije e gazuar: 3' })).toBeInTheDocument();
    expect(screen.getByText('3 × Pije e gazuar')).toBeInTheDocument();
  });

  it('sends the buyer back to the map when the hold has expired', async () => {
    withFoodHold(false, { failWith: 410 });
    renderApp(FOOD);
    await screen.findByRole('tablist', {}, STEP_WAIT);
    fireEvent.click(screen.getByRole('button', { name: 'Më shumë: Kokoshka mesatare' }));
    expect(
      await screen.findByRole('heading', { name: 'Koha e rezervimit mbaroi' }, STEP_WAIT),
    ).toBeInTheDocument();
  });

  it('shows a retry when the menu cannot be loaded', async () => {
    const map = standardMap();
    const booking = heldBooking(map, [map.seats[0]?.id ?? '']);
    stubAuth(testUser(), {
      seatmap: { [map.showtime.id]: map },
      menu: { [map.location.slug]: { status: 500, body: { error: { code: 'x', message: 'x' } } } },
      bookings: ({ method, path }) =>
        method === 'GET' && path === '/api/bookings/current' ? { booking } : undefined,
    });
    renderApp(FOOD);
    expect(await screen.findByText('Menyja nuk u ngarkua.', {}, STEP_WAIT)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Provo përsëri' })).toBeInTheDocument();
    // Skipping still works without a menu.
    expect(screen.getByRole('button', { name: 'Kalo këtë hap' })).toBeEnabled();
  });
});
