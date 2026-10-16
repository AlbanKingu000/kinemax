import type { AdminLocation } from '@kinemax/shared';
import { createContext, useContext } from 'react';

// The cinema the admin panel works on: the top bar's switcher sets it, every page reads it.
// `selectedId` null = all cinemas (super admin only; a manager always has one of theirs).

export interface AdminLocationValue {
  locations: AdminLocation[];
  selectedId: string | null;
  /** The selected cinema, or null for "all". */
  selected: AdminLocation | null;
  canSelectAll: boolean;
  select: (id: string | null) => void;
}

export const AdminLocationContext = createContext<AdminLocationValue | null>(null);

export function useAdminLocation(): AdminLocationValue {
  const value = useContext(AdminLocationContext);
  if (!value) throw new Error('useAdminLocation must be used inside <AdminLocationProvider>');
  return value;
}

export const ADMIN_LOCATION_KEY = 'kinemax.admin.location';

export function readAdminLocation(): string | null {
  try {
    return window.localStorage.getItem(ADMIN_LOCATION_KEY);
  } catch {
    return null;
  }
}

export function storeAdminLocation(id: string | null): void {
  try {
    if (id === null) window.localStorage.removeItem(ADMIN_LOCATION_KEY);
    else window.localStorage.setItem(ADMIN_LOCATION_KEY, id);
  } catch {
    // Storage unavailable: the choice lasts until the page is reloaded.
  }
}

/**
 * The cinema to start with: the stored one if the user may still see it; otherwise "all" for a
 * super admin and the first own cinema for a manager.
 */
export function initialAdminLocation(
  locations: readonly AdminLocation[],
  canSelectAll: boolean,
  stored: string | null,
): string | null {
  if (stored && locations.some((l) => l.id === stored)) return stored;
  return canSelectAll ? null : (locations[0]?.id ?? null);
}
