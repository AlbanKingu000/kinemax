import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { Button } from './Button';

describe('Button', () => {
  it('renders a primary type="button" by default and handles clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Bli bileta</Button>);
    const button = screen.getByRole('button', { name: 'Bli bileta' });
    expect(button).toHaveAttribute('type', 'button');
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps a submit type and renders icons on both sides', () => {
    const { container } = render(
      <Button type="submit" variant="secondary" size="lg" icon="ticket" iconEnd="arrowRight">
        Vazhdo
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Vazhdo' })).toHaveAttribute('type', 'submit');
    expect(container.querySelectorAll('svg')).toHaveLength(2);
  });

  it('is busy, disabled and announces loading in the current language', () => {
    const onClick = vi.fn();
    render(
      <I18nProvider locale="en">
        <Button loading onClick={onClick} iconEnd="arrowRight">
          Pay
        </Button>
      </I18nProvider>,
    );
    const button = screen.getByRole('button', { name: /Pay/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Loading…');
    expect(button.querySelector('svg')).toBeNull();
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('can be disabled', () => {
    render(
      <Button variant="ghost" disabled>
        Anulo
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Anulo' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('renders an icon-only button with its accessible name', () => {
    const { container } = render(
      <Button variant="icon" icon="search" aria-label="Kërko" size="sm" />,
    );
    const button = screen.getByRole('button', { name: 'Kërko' });
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(button.textContent).toBe('');
  });
});
