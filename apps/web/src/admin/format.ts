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

/** Occupancy with one decimal ("57,1%" / "57.1%"); "<0,1%" for a tiny share that is not zero. */
export function percent(locale: Locale, part: number, whole: number): string {
  const value = whole > 0 && part > 0 ? (part / whole) * 100 : 0;
  const comma = (text: string) => (locale === 'sq' ? text.replace('.', ',') : text);
  if (value > 0 && value < 0.1) return `<${comma('0.1')}%`;
  return `${comma(value.toFixed(1))}%`;
}
