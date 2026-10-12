import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import type { Locale } from '../../i18n/messages';
import { group, showtimeId } from '../../test/showtimes';
import { ShowtimeGroups } from './ShowtimeGroups';

const slot = (startTime: string, availability: 'AVAILABLE' | 'FEW_LEFT' | 'SOLD_OUT') => ({
  id: showtimeId(),
  startsAt: '2026-10-12T18:30:00.000Z',
  endsAt: '2026-10-12T20:30:00.000Z',
  startTime,
  endTime: '22:30',
  hallName: 'Salla 2',
  availability,
});

function renderGroups(locale: Locale = 'sq') {
  const available = slot('18:00', 'AVAILABLE');
  const few = slot('20:30', 'FEW_LEFT');
  const sold = slot('22:45', 'SOLD_OUT');
  render(
    <I18nProvider locale={locale}>
      <MemoryRouter>
        <ShowtimeGroups
          groups={[
            group({
              format: '3D',
              languageVersion: 'DUBBED_SQ',
              showtimes: [available, few, sold],
            }),
            group({
              hallType: { code: 'PRIVATE_SUITE', nameSq: 'Suitë private', nameEn: 'Private suite' },
              fromPrice: { kind: 'WHOLE_HALL', amountCents: 14_000 },
            }),
            group({ fromPrice: null }),
          ]}
        />
      </MemoryRouter>
    </I18nProvider>,
  );
  return { available, few, sold };
}

describe('ShowtimeGroups', () => {
  it('shows each group with hall type, badges and the "from" price', () => {
    renderGroups();
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(['Standard', 'Suitë private', 'Standard']);
    const first = headings[0]?.closest('section') as HTMLElement;
    expect(within(first).getByText('3D')).toBeInTheDocument();
    expect(within(first).getByText('Dublim shqip')).toBeInTheDocument();
    expect(within(first).getByText('nga 4,50 €')).toBeInTheDocument();
    expect(screen.getByText('140,00 € për gjithë suitën')).toBeInTheDocument();
    // No price rule: no price text.
    const last = headings[2]?.closest('section') as HTMLElement;
    expect(within(last).queryByText(/€/)).not.toBeInTheDocument();
  });

  it('links bookable times to the booking page and disables sold-out ones', () => {
    const { available, few, sold } = renderGroups();
    expect(screen.getByRole('link', { name: '18:00, Salla: Salla 2, Ka vende' })).toHaveAttribute(
      'href',
      `/booking/${available.id}`,
    );
    const fewLink = screen.getByRole('link', { name: '20:30, Salla: Salla 2, Pak vende' });
    expect(fewLink).toHaveAttribute('href', `/booking/${few.id}`);
    expect(fewLink).toHaveAttribute('data-availability', 'FEW_LEFT');
    expect(within(fewLink).getByText('Pak vende')).toBeInTheDocument();

    const soldOut = screen.getByRole('link', { name: '22:45, Salla: Salla 2, Shitur' });
    expect(soldOut).toHaveAttribute('aria-disabled', 'true');
    expect(soldOut).not.toHaveAttribute('href');
    expect(soldOut.tabIndex).toBe(-1);
    expect(document.querySelector(`a[href="/booking/${sold.id}"]`)).toBeNull();
  });

  it('speaks English with English prices', () => {
    renderGroups('en');
    expect(screen.getAllByText('from €4.50').length).toBeGreaterThan(0);
    expect(screen.getByText('€140.00 for the whole suite')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Private suite' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '20:30, Hall: Salla 2, Few seats left' }),
    ).toBeInTheDocument();
  });
});
