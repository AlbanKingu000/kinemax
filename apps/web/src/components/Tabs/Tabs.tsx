import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

interface TabsProps {
  /** Accessible name of the tab list. */
  label: string;
  tabs: readonly TabItem[];
  defaultTab?: string;
  /** Controlled mode: the selected tab, kept by the parent (e.g. in the URL). */
  selected?: string;
  onSelect?: (id: string) => void;
  className?: string;
}

/**
 * WAI-ARIA tabs with automatic activation: arrow keys move and select, Home/End jump to the ends,
 * only the selected tab is in the tab order.
 */
export function Tabs({
  label,
  tabs,
  defaultTab,
  selected: controlled,
  onSelect,
  className,
}: TabsProps) {
  const baseId = useId();
  const [own, setOwn] = useState(defaultTab ?? tabs[0]?.id);
  const selected = controlled ?? own;
  const setSelected = (id: string) => {
    setOwn(id);
    onSelect?.(id);
  };
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  function select(index: number) {
    const tab = tabs[(index + tabs.length) % tabs.length];
    if (!tab) return;
    setSelected(tab.id);
    tabRefs.current.get(tab.id)?.focus();
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab, index) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => {
                setSelected(tab.id);
              }}
              onKeyDown={(event) => {
                onKeyDown(event, index);
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={tab.id !== selected}
          tabIndex={0}
          className={styles.panel}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
