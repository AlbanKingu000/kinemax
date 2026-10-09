import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Link } from './Link';

describe('Link', () => {
  it('renders an inline router link', () => {
    render(
      <MemoryRouter>
        <Link to="/kushtet">kushtet</Link>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'kushtet' });
    expect(link).toHaveAttribute('href', '/kushtet');
    expect(link.querySelector('svg')).toBeNull();
  });

  it('adds a decorative arrow to standalone links', () => {
    render(
      <MemoryRouter>
        <Link to="/filmat" variant="standalone" className="extra">
          Të gjithë filmat
        </Link>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Të gjithë filmat' });
    expect(link).toHaveClass('extra');
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
