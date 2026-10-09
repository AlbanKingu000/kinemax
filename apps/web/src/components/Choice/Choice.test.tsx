import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';
import { RadioGroup } from './Radio';
import { Switch } from './Switch';

describe('Checkbox', () => {
  it('is labelled and toggles', () => {
    const onChange = vi.fn();
    render(<Checkbox label="Më njofto" onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Më njofto' });
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('supports the indeterminate and disabled states', () => {
    render(
      <>
        <Checkbox label="Të gjitha" indeterminate readOnly />
        <Checkbox label="Joaktiv" disabled />
      </>,
    );
    expect(screen.getByRole('checkbox', { name: 'Të gjitha' })).toHaveProperty(
      'indeterminate',
      true,
    );
    expect(screen.getByRole('checkbox', { name: 'Joaktiv' })).toBeDisabled();
  });
});

describe('RadioGroup', () => {
  function SeatType() {
    const [value, setValue] = useState<'standard' | 'vip'>('standard');
    return (
      <RadioGroup
        legend="Lloji i vendit"
        name="seat"
        value={value}
        onChange={setValue}
        inline
        options={[
          { value: 'standard', label: 'Standard' },
          { value: 'vip', label: 'VIP' },
          { value: 'couple' as 'vip', label: 'Divan', disabled: true },
        ]}
      />
    );
  }

  it('groups radios under a legend and changes the value', () => {
    render(<SeatType />);
    const group = screen.getByRole('group', { name: 'Lloji i vendit' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Standard' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'VIP' }));
    expect(screen.getByRole('radio', { name: 'VIP' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Standard' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Divan' })).toBeDisabled();
  });
});

describe('Switch', () => {
  it('exposes the switch role and its state', () => {
    render(<Switch label="Kujtesë" defaultChecked />);
    const control = screen.getByRole('switch', { name: 'Kujtesë' });
    expect(control).toBeChecked();
    fireEvent.click(control);
    expect(control).not.toBeChecked();
  });
});
