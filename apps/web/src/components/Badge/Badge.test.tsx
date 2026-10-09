import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { AgeBadge, Badge, FormatBadge, LanguageBadge } from './Badge';
import { AGE_RATINGS } from './movie-labels';

describe('Badge', () => {
  it('renders its text', () => {
    render(<Badge tone="crimson">Premierë</Badge>);
    expect(screen.getByText('Premierë')).toBeInTheDocument();
  });

  it.each([
    ['ALL', 'ALL', 'Për të gjitha moshat'],
    ['AGE_7', '7+', 'Nga mosha 7 vjeç'],
    ['AGE_12', '12+', 'Nga mosha 12 vjeç'],
    ['AGE_15', '15+', 'Nga mosha 15 vjeç'],
    ['AGE_18', '18+', 'Vetëm për të rriturit, 18 vjeç e lart'],
  ] as const)('shows %s as %s with a spoken description', (rating, code, spoken) => {
    render(<AgeBadge rating={rating} />);
    expect(screen.getByText(code)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(spoken)).toHaveClass('visually-hidden');
  });

  it('covers every rating', () => {
    expect(AGE_RATINGS).toEqual(['ALL', 'AGE_7', 'AGE_12', 'AGE_15', 'AGE_18']);
  });

  it('shows formats and translated language versions', () => {
    render(
      <I18nProvider locale="en">
        <FormatBadge format="3D" />
        <LanguageBadge version="DUBBED_SQ" />
        <AgeBadge rating="AGE_12" />
      </I18nProvider>,
    );
    expect(screen.getByText('3D')).toBeInTheDocument();
    expect(screen.getByText('Albanian dub')).toBeInTheDocument();
    expect(screen.getByText('Ages 12 and over')).toBeInTheDocument();
  });
});
