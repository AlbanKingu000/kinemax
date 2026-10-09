import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import styles from './Chip.module.css';

type ChipProps =
  | {
      /** Toggle chip (filters): a button with aria-pressed. */
      label: string;
      selected: boolean;
      onToggle: (selected: boolean) => void;
      onRemove?: never;
      disabled?: boolean;
    }
  | {
      /** Removable chip (active filters): text plus a labelled remove button. */
      label: string;
      onRemove: () => void;
      selected?: never;
      onToggle?: never;
      disabled?: boolean;
    };

export function Chip(props: ChipProps) {
  const t = useMessages();
  if (props.onRemove) {
    const { label, onRemove, disabled } = props;
    return (
      <span className={`${styles.chip} ${styles.removable}`}>
        <span>{label}</span>
        <button
          type="button"
          className={styles.remove}
          aria-label={t.common.remove(label)}
          onClick={onRemove}
          disabled={disabled}
        >
          <Icon name="close" size={14} />
        </button>
      </span>
    );
  }
  const { label, selected, onToggle, disabled } = props;
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => {
        onToggle(!selected);
      }}
    >
      {selected && <Icon name="check" size={14} />}
      <span>{label}</span>
    </button>
  );
}
