// The chosen cinema survives reloads (localStorage). Closing the picker without choosing is only
// remembered for the browser session (sessionStorage), so a later visit asks again. Storage can be
// blocked (privacy mode, policies): never throw, the site then simply asks again.

export const LOCATION_STORAGE_KEY = 'kinemax.location';
export const PICKER_DISMISSED_KEY = 'kinemax.location-picker-dismissed';

export function readStoredLocation(): string | undefined {
  try {
    return window.localStorage.getItem(LOCATION_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function storeLocation(slug: string | undefined): void {
  try {
    if (slug === undefined) window.localStorage.removeItem(LOCATION_STORAGE_KEY);
    else window.localStorage.setItem(LOCATION_STORAGE_KEY, slug);
  } catch {
    // Storage unavailable: the choice lasts until the page is reloaded.
  }
}

export function wasPickerDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(PICKER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberPickerDismissed(): void {
  try {
    window.sessionStorage.setItem(PICKER_DISMISSED_KEY, '1');
  } catch {
    // Storage unavailable: the picker opens again on the next page load.
  }
}
