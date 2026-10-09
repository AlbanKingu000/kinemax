import { locales, type Locale } from '../../i18n/messages';
import { useLocale, useMessages } from '../../i18n/use-messages';
import styles from './LanguageSwitch.module.css';

/** Each language is named in itself, so people can find their own language. The accessible
 * name starts with the visible code (WCAG 2.5.3 label in name). */
const NATIVE_NAMES: Record<Locale, string> = { sq: 'Shqip', en: 'English' };

/** SQ / EN toggle. The choice is remembered and sets <html lang>. */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useMessages();
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label={t.common.language}
      className={[styles.switch, className].filter(Boolean).join(' ')}
    >
      {locales.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          className={styles.option}
          aria-pressed={option === locale}
          aria-label={`${option.toUpperCase()} (${NATIVE_NAMES[option]})`}
          onClick={() => {
            setLocale(option);
          }}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
