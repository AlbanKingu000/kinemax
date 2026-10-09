import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container, Grid } from './Layout';

describe('Container and Grid', () => {
  it('renders a container as the chosen element', () => {
    render(
      <Container as="main" narrow id="content">
        Teksti
      </Container>,
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'content');
  });

  it('passes the minimum column width as a CSS variable', () => {
    render(
      <Grid as="ul" min="12rem" gap="lg" className="movies">
        <li>Një</li>
        <li>Dy</li>
      </Grid>,
    );
    const list = screen.getByRole('list');
    expect(list.style.getPropertyValue('--grid-min')).toBe('12rem');
    expect(list).toHaveClass('movies');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('has sensible defaults', () => {
    const { container } = render(
      <Grid>
        <div />
      </Grid>,
    );
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.tagName).toBe('DIV');
    expect(grid.style.getPropertyValue('--grid-min')).toBe('14rem');
  });
});
