import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './QuantityStepper';

function Counter({ max = 3 }: { max?: number }) {
  const [value, setValue] = useState(0);
  return <QuantityStepper value={value} onChange={setValue} itemName="Kokoshka" max={max} />;
}

describe('QuantityStepper', () => {
  it('counts up and down within its limits, naming the item for screen readers', () => {
    render(<Counter max={2} />);
    const less = screen.getByRole('button', { name: 'Më pak: Kokoshka' });
    const more = screen.getByRole('button', { name: 'Më shumë: Kokoshka' });
    expect(less).toBeDisabled();
    fireEvent.click(more);
    fireEvent.click(more);
    expect(screen.getByRole('status', { name: 'Kokoshka: 2' })).toHaveTextContent('2');
    expect(more).toBeDisabled();
    fireEvent.click(less);
    expect(screen.getByRole('status', { name: 'Kokoshka: 1' })).toBeInTheDocument();
    expect(less).toBeEnabled();
  });

  it('can be disabled as a whole', () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} onChange={onChange} itemName="Ujë" disabled />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});
