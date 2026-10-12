import { useMessages } from '../../i18n/use-messages';
import { useLocationChoice } from '../../location/location-context';
import { Icon } from '../Icon/Icon';
import styles from './LocationButton.module.css';

/** Shows the chosen city (or "Choose your cinema") and opens the cinema picker. */
export function LocationButton({ block = false }: { block?: boolean }) {
  const t = useMessages();
  const { selected, openPicker } = useLocationChoice();
  return (
    <button
      type="button"
      className={[styles.button, block && styles.block].filter(Boolean).join(' ')}
      aria-haspopup="dialog"
      onClick={openPicker}
    >
      <Icon name="mapPin" size={18} className={styles.icon} />
      {selected ? (
        <span>
          <span className="visually-hidden">{t.location.current}</span> {selected.city}
        </span>
      ) : (
        <span>{t.location.choose}</span>
      )}
      <Icon name="chevronDown" size={16} className={styles.chevron} />
    </button>
  );
}
