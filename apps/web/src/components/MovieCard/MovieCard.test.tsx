import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { MovieCard } from './MovieCard';

function renderCard(ui: React.ReactNode, locale: 'sq' | 'en' = 'sq') {
  return render(
    <I18nProvider locale={locale}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}

describe('MovieCard', () => {
  it('shows the title as a link, meta, rating and badges', () => {
    renderCard(
      <MovieCard
        title="Fanari i Heshtur"
        to="/filmat/fanari-i-heshtur"
        posterSrc="/seed/posters/fanari-i-heshtur.svg"
        ageRating="AGE_15"
        formats={['2D', '3D']}
        languageVersion="ORIGINAL_SQ_SUBTITLES"
        durationMinutes={112}
        genres={['Triller', 'Mister']}
      />,
    );
    const card = screen.getByRole('article');
    const link = within(card).getByRole('link', { name: 'Fanari i Heshtur' });
    expect(link).toHaveAttribute('href', '/filmat/fanari-i-heshtur');
    expect(within(card).getByRole('heading', { level: 3 })).toContainElement(link);
    expect(within(card).getByText('Triller · Mister · 1 orë 52 min')).toBeInTheDocument();
    expect(within(card).getByText('Nga mosha 15 vjeç')).toBeInTheDocument();
    expect(within(card).getByText('3D')).toBeInTheDocument();
    expect(within(card).getByText('Titra shqip')).toBeInTheDocument();
    expect(card.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('falls back to a decorative placeholder without a poster', () => {
    renderCard(
      <MovieCard
        title="Pipa"
        to="/m/pipa"
        ageRating="ALL"
        durationMinutes={45}
        headingLevel="h2"
      />,
      'en',
    );
    const card = screen.getByRole('article');
    expect(card.querySelector('img')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Pipa' })).toBeInTheDocument();
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('omits empty meta and badge rows', () => {
    renderCard(<MovieCard title="X" to="/x" ageRating="AGE_18" />);
    const card = screen.getByRole('article');
    expect(card.querySelectorAll('p')).toHaveLength(0);
  });
});
