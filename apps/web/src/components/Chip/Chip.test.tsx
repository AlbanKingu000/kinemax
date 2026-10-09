import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { Chip } from './Chip';

describe('Chip', () => {
  it('toggles with aria-pressed', () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Chip label="Dramë" selected={false} onToggle={onToggle} />);
    const chip = screen.getByRole('button', { name: 'Dramë' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenCalledWith(true);

    rerender(<Chip label="Dramë" selected onToggle={onToggle} />);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('has a translated remove button', () => {
    const onRemove = vi.fn();
    render(
      <I18nProvider locale="en">
        <Chip label="VIP hall" onRemove={onRemove} />
      </I18nProvider>,
    );
    expect(screen.getByText('VIP hall')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove VIP hall' }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
