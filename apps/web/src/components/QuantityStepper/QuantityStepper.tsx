import { useMessages } from '../../i18n/use-messages';
import { Icon } from '../Icon/Icon';
import styles from './QuantityStepper.module.css';

interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  /** What is counted, for the accessible names ("Kokoshka mesatare"). */
  itemName: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * − value + for a quantity: two real buttons whose accessible names name the item, and the value
 * announced politely. The minus turns off at `min`, the plus at `max`.
 */
export function QuantityStepper({
  value,
  onChange,
  itemName,
  min = 0,
  max = 99,
  disabled = false,
}: QuantityStepperProps) {
  const t = useMessages();
  return (
    <div className={styles.stepper} data-active={value > min || undefined}>
      <button
        type="button"
        className={styles.button}
        aria-label={t.common.decrease(itemName)}
        disabled={disabled || value <= min}
        onClick={() => {
          onChange(Math.max(min, value - 1));
        }}
      >
        <Icon name="minus" size={16} />
      </button>
      <output
        className={styles.value}
        aria-live="polite"
        aria-label={t.common.quantityOf(itemName, value)}
      >
        {value}
      </output>
      <button
        type="button"
        className={styles.button}
        aria-label={t.common.increase(itemName)}
        disabled={disabled || value >= max}
        onClick={() => {
          onChange(Math.min(max, value + 1));
        }}
      >
        <Icon name="plus" size={16} />
      </button>
    </div>
  );
}
