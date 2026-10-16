import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from '../DataTable/DataTable';
import { FillBar } from '../FillBar/FillBar';
import { StatTile } from '../StatTile/StatTile';
import { BarList } from './BarList';

// The small admin dashboard pieces: ranked bars, fill bars, key figures and the dense table.

describe('BarList', () => {
  it('is a named list whose values are text, with bars relative to the largest', () => {
    const { container } = render(
      <BarList
        label="Top filmat"
        items={[
          { key: 'a', label: 'Film A', value: 200, display: '2,00 €', detail: '2 bileta' },
          { key: 'b', label: 'Film B', value: 50, display: '0,50 €' },
        ]}
      />,
    );
    const list = screen.getByRole('list', { name: 'Top filmat' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Film A2,00 €2 bileta', 'Film B0,50 €']);
    const widths = [...container.querySelectorAll<HTMLElement>('[aria-hidden] > span')].map(
      (bar) => bar.style.width,
    );
    expect(widths).toEqual(['100%', '25%']);
  });
});

describe('FillBar', () => {
  it('is a meter with the percentage as text', () => {
    render(<FillBar value={3} max={12} label="Mbushja" />);
    const meter = screen.getByRole('meter', { name: 'Mbushja' });
    expect(meter).toHaveAttribute('aria-valuenow', '3');
    expect(meter).toHaveAttribute('aria-valuetext', '25%');
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('shows 0% for an empty hall', () => {
    render(<FillBar value={0} max={0} label="Bosh" />);
    expect(screen.getByRole('meter', { name: 'Bosh' })).toHaveAttribute('aria-valuetext', '0%');
  });
});

describe('StatTile and DataTable', () => {
  it('render a key figure and a captioned, focusable table region', () => {
    render(
      <>
        <StatTile label="Bileta" value="42" detail="sot" />
        <DataTable caption="Shfaqjet" hideCaption>
          <tbody>
            <tr>
              <td>x</td>
            </tr>
          </tbody>
        </DataTable>
      </>,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('sot')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shfaqjet' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('table', { name: 'Shfaqjet' })).toBeInTheDocument();
  });
});
