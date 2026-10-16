import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ColumnChart } from './ColumnChart';
import { niceMax } from './nice-max';

const chart = (
  <ColumnChart
    title="Të ardhurat sipas ditës"
    series={[
      { key: 'tickets', label: 'Bileta', slot: 1 },
      { key: 'food', label: 'Ushqim', slot: 2 },
    ]}
    data={[
      { label: '9 mars 2030', short: '9', values: { tickets: 1200, food: 300 } },
      { label: '10 mars 2030', short: '10', values: { tickets: -450, food: 0 } },
    ]}
    formatValue={(v) => `${String(v / 100)} €`}
    categoryLabel="Dita"
    totalLabel="Gjithsej"
  />
);

describe('ColumnChart', () => {
  it('names the chart, always shows a legend and draws one mark per non-zero part', () => {
    const { container } = render(chart);
    expect(
      screen.getByRole('img', { name: /^Të ardhurat sipas ditës: grafik me 2 kolona/ }),
    ).toBeInTheDocument();
    const legend = screen.getByRole('list');
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Bileta', 'Ushqim']);
    // Day 1: tickets + food; day 2 is negative and drawn as nothing.
    expect(container.querySelectorAll('path[data-slot]')).toHaveLength(2);
  });

  it('opens a data table with the real values from a toggle', () => {
    render(chart);
    const toggle = screen.getByRole('button', { name: 'Shfaq të dhënat si tabelë' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const table = screen.getByRole('table', { name: 'Të ardhurat sipas ditës' });
    const rows = within(table).getAllByRole('row');
    expect(rows[2]?.textContent).toBe('10 mars 2030-4.5 €0 €-4.5 €');
    expect(within(table).getByRole('columnheader', { name: 'Gjithsej' })).toBeInTheDocument();
  });

  it('shows a tooltip for the column under the mouse', () => {
    const { container } = render(chart);
    const hit = container.querySelectorAll('rect')[0];
    if (!hit) throw new Error('no hit target');
    fireEvent.mouseEnter(hit);
    expect(screen.getByText('9 mars 2030', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Gjithsej: 15 €')).toBeInTheDocument();
  });

  it('rounds the axis to clean numbers', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1450)).toBe(2000);
    expect(niceMax(2100)).toBe(2500);
    expect(niceMax(3000)).toBe(5000);
    expect(niceMax(9000)).toBe(10_000);
  });
});
