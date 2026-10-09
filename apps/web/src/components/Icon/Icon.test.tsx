import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { ICON_NAMES } from './icon-paths';

describe('Icon', () => {
  it('is hidden from assistive technology by default', () => {
    const { container } = render(<Icon name="ticket" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '20');
  });

  it('has an accessible name when labelled', () => {
    render(<Icon name="search" size={24} label="Kërko" />);
    expect(screen.getByRole('img', { name: 'Kërko' })).toHaveAttribute('height', '24');
  });

  it('has a path for every icon name', () => {
    expect(ICON_NAMES.length).toBeGreaterThan(15);
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      expect(container.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
      unmount();
    }
  });
});
