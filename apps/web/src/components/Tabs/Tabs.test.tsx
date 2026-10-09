import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

const tabs = [
  { id: 'today', label: 'Sot', content: 'Shfaqjet e sotme' },
  { id: 'tomorrow', label: 'Nesër', content: 'Shfaqjet e nesërme' },
  { id: 'weekend', label: 'Fundjava', content: 'Fundjava' },
];

describe('Tabs', () => {
  it('shows the first tab and its panel', () => {
    render(<Tabs label="Ditët" tabs={tabs} />);
    expect(screen.getByRole('tablist', { name: 'Ditët' })).toBeInTheDocument();
    const today = screen.getByRole('tab', { name: 'Sot' });
    expect(today).toHaveAttribute('aria-selected', 'true');
    expect(today).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Nesër' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: 'Sot' })).toHaveTextContent('Shfaqjet e sotme');
  });

  it('selects tabs by click and with the keyboard', () => {
    render(<Tabs label="Ditët" tabs={tabs} defaultTab="tomorrow" />);
    const tomorrow = screen.getByRole('tab', { name: 'Nesër' });
    expect(tomorrow).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tomorrow, { key: 'ArrowRight' });
    const weekend = screen.getByRole('tab', { name: 'Fundjava' });
    expect(weekend).toHaveAttribute('aria-selected', 'true');
    expect(weekend).toHaveFocus();

    fireEvent.keyDown(weekend, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Sot' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sot' }), { key: 'ArrowLeft' });
    expect(weekend).toHaveFocus();

    fireEvent.keyDown(weekend, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Sot' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Sot' }), { key: 'End' });
    expect(weekend).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(weekend, { key: 'a' });
    expect(weekend).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(tomorrow);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Shfaqjet e nesërme');
  });
});
