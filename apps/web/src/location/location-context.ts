import type { LocationSummary } from '@kinemax/shared';
import { createContext, useContext } from 'react';
import type { AsyncState } from '../hooks/use-async';

export interface LocationContextValue {
  /** All active cinemas (loading / error / ready). */
  locations: AsyncState<LocationSummary[]> & { retry: () => void };
  /** The chosen cinema; null shows data for all cinemas. */
  selected: LocationSummary | null;
  /** False until the saved choice has been checked against the cinema list. */
  ready: boolean;
  choose: (slug: string) => void;
  pickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
}

export const LocationContext = createContext<LocationContextValue | null>(null);

export function useLocationChoice(): LocationContextValue {
  const value = useContext(LocationContext);
  if (!value) throw new Error('useLocationChoice must be used inside <LocationProvider>');
  return value;
}
