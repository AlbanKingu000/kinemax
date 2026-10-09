import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { Input } from '../Input/Input';
import { Select } from '../Select/Select';
import { FormField } from './FormField';

describe('FormField', () => {
  it('connects the label and hint to the control', () => {
    render(
      <FormField label="Email-i" hint="Biletat dërgohen këtu." required>
        {(props) => <Input {...props} type="email" />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: /Email-i/ });
    expect(input).toBeRequired();
    expect(input).toHaveAccessibleDescription('Biletat dërgohen këtu.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('marks the control invalid and reads the error first', () => {
    render(
      <FormField label="Emri" hint="Si në dokument." error="Shkruaj emrin.">
        {(props) => <Input {...props} />}
      </FormField>,
    );
    const input = screen.getByRole('textbox', { name: 'Emri' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Shkruaj emrin. Si në dokument.');
  });

  it('labels optional fields in the current language and works with selects', () => {
    render(
      <I18nProvider locale="en">
        <FormField label="City" optional>
          {(props) => (
            <Select {...props} defaultValue="">
              <option value="">Choose</option>
              <option value="pr">Prishtinë</option>
            </Select>
          )}
        </FormField>
      </I18nProvider>,
    );
    const select = screen.getByRole('combobox', { name: 'City (optional)' });
    expect(select).not.toHaveAttribute('aria-describedby');
  });
});

describe('Input', () => {
  it('renders a decorative leading icon', () => {
    const { container } = render(<Input aria-label="Kërko" icon="search" type="search" />);
    expect(screen.getByRole('searchbox', { name: 'Kërko' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
