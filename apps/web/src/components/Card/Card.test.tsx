import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card';

describe('Card', () => {
  it('renders a div by default', () => {
    const { container } = render(<Card>Përmbajtja</Card>);
    expect(container.firstElementChild?.tagName).toBe('DIV');
    expect(screen.getByText('Përmbajtja')).toBeInTheDocument();
  });

  it('can render as an article with options', () => {
    render(
      <Card as="article" variant="elevated" padding="lg" interactive className="x">
        <h3>Salla VIP</h3>
      </Card>,
    );
    const article = screen.getByRole('article');
    expect(article).toHaveClass('x');
    expect(article).toContainElement(screen.getByRole('heading', { name: 'Salla VIP' }));
  });
});
