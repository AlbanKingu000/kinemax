import type { ReactNode } from 'react';
import { dayTabLabel } from '../../i18n/format';
import { useMessages } from '../../i18n/use-messages';
import { Tabs } from '../Tabs/Tabs';
import styles from './DayTabs.module.css';

interface DayTabsProps {
  /** The browsable days (YYYY-MM-DD, today first) in the cinema's time zone. */
  days: readonly string[];
  selected: string;
  onSelect: (day: string) => void;
  /** Content of the selected day. */
  children: ReactNode;
}

/** "Sot", "Nesër", then weekday + date: keyboard tabs (arrows, Home, End) that scroll on phones. */
export function DayTabs({ days, selected, onSelect, children }: DayTabsProps) {
  const t = useMessages();
  return (
    <Tabs
      label={t.dates.days}
      className={styles.tabs}
      selected={selected}
      onSelect={onSelect}
      tabs={days.map((day, index) => {
        const label = dayTabLabel(t, day, index);
        return {
          id: day,
          label: (
            <span className={styles.label}>
              <span>{label.day}</span>
              <span className={styles.date}>{label.date}</span>
            </span>
          ),
          content: day === selected ? children : null,
        };
      })}
    />
  );
}
