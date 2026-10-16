import { formatPrice } from '../i18n/format';
import type { Locale } from '../i18n/messages';

/** Euro amounts that may be negative (net of refunds): "−4,50 €". */
export function formatMoney(locale: Locale, cents: number): string {
  return cents < 0 ? `−${formatPrice(locale, -cents)}` : formatPrice(locale, cents);
}

/** Whole euros for chart axes: "1 200 €" / "€1,200". */
export function formatEuros(locale: Locale, cents: number): string {
  const euros = Math.round(cents / 100);
  const digits = String(Math.abs(euros)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    locale === 'sq' ? ' ' : ',',
  );
  const sign = euros < 0 ? '−' : '';
  return locale === 'sq' ? `${sign}${digits} €` : `${sign}€${digits}`;
}

/** "62%" (0% when there is nothing to fill). */
export function percent(part: number, whole: number): string {
  return `${String(whole > 0 ? Math.round((part / whole) * 100) : 0)}%`;
}
