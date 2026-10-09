import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from './I18nProvider';
import { LOCALE_STORAGE_KEY, readStoredLocale, storeLocale } from './locale-storage';
import { useLocale, useMessages } from './use-messages';

function Probe() {
  const t = useMessages();
  const { locale, setLocale } = useLocale();
  return (
    <>
      <p>{t.notFound.title}</p>
      <button
        type="button"
        onClick={() => {
          setLocale(locale === 'sq' ? 'en' : 'sq');
        }}
      >
        toggle
      </button>
    </>
  );
}

describe('I18nProvider', () => {
  it('defaults to Albanian and sets <html lang>', () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Faqja nuk u gjet')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('sq');
  });

  it('switches language, remembers it and updates <html lang>', () => {
    const { unmount } = render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    act(() => {
      screen.getByRole('button').click();
    });
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    unmount();

    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('prefers an explicit locale over the remembered one', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    render(
      <I18nProvider locale="sq">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText('Faqja nuk u gjet')).toBeInTheDocument();
  });
});

describe('locale storage', () => {
  it('ignores unknown stored values', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    expect(readStoredLocale()).toBeUndefined();
  });

  it('never throws when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(readStoredLocale()).toBeUndefined();
    expect(() => {
      storeLocale('en');
    }).not.toThrow();
  });
});
