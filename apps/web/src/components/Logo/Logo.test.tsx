import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo } from './Logo';

describe('Logo', () => {
  it.each(['full', 'horizontal', 'monogram'] as const)(
    'renders the %s variant with a name',
    (variant) => {
      render(<Logo variant={variant} />);
      const logo = screen.getByRole('img', { name: 'Kinemax' });
      expect(logo).toHaveAttribute('data-variant', variant);
      expect(logo.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/);
      expect(logo.querySelectorAll('path')).toHaveLength(2);
    },
  );

  it('defaults to the horizontal logo and accepts another name', () => {
    render(<Logo title="Kinemax, faqja kryesore" className="header-logo" />);
    const logo = screen.getByRole('img', { name: 'Kinemax, faqja kryesore' });
    expect(logo).toHaveAttribute('data-variant', 'horizontal');
    expect(logo).toHaveClass('header-logo');
  });
});
