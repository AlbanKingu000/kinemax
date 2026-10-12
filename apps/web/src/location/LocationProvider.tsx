import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchLocations } from '../api/catalog';
import { useAsync } from '../hooks/use-async';
import { LocationContext, type LocationContextValue } from './location-context';
import {
  readStoredLocation,
  rememberPickerDismissed,
  storeLocation,
  wasPickerDismissed,
} from './location-storage';

/**
 * Loads the cinemas once and holds the visitor's choice. On the first visit (no valid saved
 * choice, picker not dismissed in this session) the picker opens as soon as the list is loaded.
 * A saved slug that no longer exists is ignored and removed from storage.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const locations = useAsync(fetchLocations, 'locations');
  const [slug, setSlug] = useState(readStoredLocation);
  // "auto": open by itself once the list shows there is no valid choice; then the visitor decides.
  const [picker, setPicker] = useState<'auto' | 'open' | 'closed'>(() =>
    wasPickerDismissed() ? 'closed' : 'auto',
  );

  const list = locations.status === 'ready' ? locations.data : undefined;
  const selected = (slug !== undefined && list?.find((l) => l.slug === slug)) || null;
  const ready = locations.status !== 'loading';
  const pickerOpen = picker === 'open' || (picker === 'auto' && list !== undefined && !selected);

  useEffect(() => {
    if (list && slug !== undefined && !list.some((l) => l.slug === slug)) storeLocation(undefined);
  }, [list, slug]);

  const choose = useCallback((next: string) => {
    storeLocation(next);
    setSlug(next);
    setPicker('closed');
  }, []);

  const closePicker = useCallback(() => {
    setPicker('closed');
    rememberPickerDismissed();
  }, []);

  const openPicker = useCallback(() => {
    setPicker('open');
  }, []);

  const value = useMemo<LocationContextValue>(
    () => ({ locations, selected, ready, choose, pickerOpen, openPicker, closePicker }),
    [locations, selected, ready, choose, pickerOpen, openPicker, closePicker],
  );

  return <LocationContext value={value}>{children}</LocationContext>;
}
