import { expect, test, type Page } from '@playwright/test';
import { findShowtime, watchConsole } from './booking-helpers.ts';

// The 3D hall against the production build: the opening front view, the locked seat view
// (look around, seat to seat, back to the hall) and the header following the show's cinema.
// Seats are opened through the automated-browser test hook instead of aiming at the canvas.

interface Seat {
  id: string;
  row: string;
  number: number;
  type: string;
  y: number;
}

declare global {
  interface Window {
    __kinemaxHall?: { viewSeat: (id: string) => void };
  }
}

async function open3D(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Shiko sallën në 3D' }).click();
  const hall = page.locator('[data-camera]');
  // Software WebGL in headless Chromium: the first frames take a while.
  await expect(hall).toHaveAttribute('data-camera', 'front', { timeout: 20_000 });
  return hall;
}

test('3D hall: front view, locked seat view, seat to seat and back', async ({
  page,
  request,
  isMobile,
}) => {
  // The full flight there and back (2.3 s each) on a software renderer.
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.localStorage.setItem('kinemax.location', 'prizren');
  });
  const problems = watchConsole(page);
  const id = await findShowtime(request, 'STANDARD');
  const { seats } = (await (await request.get(`/api/showtimes/${id}/seatmap`)).json()) as {
    seats: Seat[];
  };
  await page.goto(`/booking/${id}`);
  const hall = await open3D(page, isMobile);

  // It opens from the front: the camera is nearer the screen than the first row.
  const firstRow = Math.min(...seats.map((s) => s.y));
  expect(Number(await hall.getAttribute('data-camera-z'))).toBeLessThan(firstRow);

  // A seat in the middle of a middle row, with neighbours on both sides.
  const rows = [...new Set(seats.map((s) => s.row))];
  const row = rows[Math.floor(rows.length / 2)] ?? 'A';
  const inRow = seats
    .filter((s) => s.row === row && s.type !== 'WHEELCHAIR')
    .sort((a, b) => a.number - b.number);
  const seat = inRow[Math.floor(inRow.length / 2)] ?? inRow[0];
  if (!seat) throw new Error('no seat');
  await page.evaluate((seatId) => window.__kinemaxHall?.viewSeat(seatId), seat.id);

  // The card shows only once the camera has arrived.
  const card = page.getByRole('dialog');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(hall).toHaveAttribute('data-camera', 'seat');
  await expect(
    card.getByText(`Rreshti ${row} · Ulësja ${String(seat.number)} ·`, { exact: false }),
  ).toBeVisible();
  await expect(card.getByText(/^Distanca nga ekrani ~\d+ m$/)).toBeVisible();
  const seatedZ = await hall.getAttribute('data-camera-z');

  // Locked in the seat: the arrow keys only turn the head, up to the limits.
  await hall.focus();
  await expect(hall).toBeFocused();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowLeft');
  await expect(hall).toHaveAttribute('data-look-yaw', '70');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
  await expect(hall).toHaveAttribute('data-look-pitch', '20');
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await expect(hall).toHaveAttribute('data-look-pitch', '-25');
  // Dragging turns the head too, and stops at the limit the other way.
  const box = await hall.boundingBox();
  if (!box) throw new Error('no box');
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.4, { steps: 6 });
    await page.mouse.up();
  }
  await expect(hall).toHaveAttribute('data-look-yaw', '-70');
  // The wheel never moves the camera out of the seat.
  await page.mouse.wheel(0, 2000);
  await expect(hall).toHaveAttribute('data-camera-z', seatedZ ?? '');
  await expect(hall).toHaveAttribute('data-camera', 'seat');

  await card.getByRole('button', { name: 'Shiko ekranin' }).click();
  await expect(hall).toHaveAttribute('data-look-yaw', '0');
  await expect(hall).toHaveAttribute('data-look-pitch', '0');

  // Seat to seat: "]" glides to the next seat, the button back again.
  await page.keyboard.press(']');
  await expect(
    card.getByText(`Ulësja ${String(seat.number + 1)} ·`, { exact: false }),
  ).toBeVisible();
  await expect(hall).toHaveAttribute('data-camera', 'seat');
  await card.getByRole('button', { name: 'Ulësja e mëparshme' }).click();
  await expect(card.getByText(`Ulësja ${String(seat.number)} ·`, { exact: false })).toBeVisible();

  // Back to the hall: the glide ends in the front view again.
  await card.getByRole('button', { name: 'Kthehu te salla' }).click();
  await expect(card).toBeHidden();
  await expect(hall).toHaveAttribute('data-camera', 'front', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Rikthe pamjen' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('the header switches to the cinema of the show being booked', async ({
  page,
  request,
  isMobile,
}) => {
  // Chosen before: Prishtinë. The show is in Prizren.
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('kinemax.location', 'prishtine');
  });
  const id = await findShowtime(request, 'STANDARD');
  await page.goto(`/booking/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  if (isMobile) await page.getByRole('button', { name: 'Hap menynë' }).click();
  await expect(page.getByRole('button', { name: 'Kinemaja: Prizren' })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('kinemax.location'))).toBe(
    'prizren',
  );
});
