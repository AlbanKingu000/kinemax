import { useSyncExternalStore } from 'react';

// Counts the open modal dialogs (incl. the drawer), so other UI can react to them: toasts wait
// until every dialog is closed instead of covering it (and they would be inert behind it).
let openCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Marks one dialog as open; call the returned function when it closes. */
export function registerOpenModal(): () => void {
  openCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    openCount -= 1;
    emit();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsModalOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => openCount > 0,
    () => false,
  );
}
