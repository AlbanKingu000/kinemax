import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../i18n/I18nProvider';
import { LOCALE_STORAGE_KEY } from '../../i18n/locale-storage';
import { LanguageSwitch } from './LanguageSwitch';

describe('LanguageSwitch', () => {
  it('switches between Albanian and English and remembers the choice', () => {
    render(
      <I18nProvider>
        <LanguageSwitch />
      </I18nProvider>,
    );
    expect(screen.getByRole('group', { name: 'Gjuha' })).toBeInTheDocument();
    const sq = screen.getByRole('button', { name: 'SQ (Shqip)' });
    const en = screen.getByRole('button', { name: 'EN (English)' });
    expect(sq).toHaveAttribute('aria-pressed', 'true');
    expect(en).toHaveAttribute('lang', 'en');

    fireEvent.click(en);
    expect(en).toHaveAttribute('aria-pressed', 'true');
    expect(sq).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });
});
