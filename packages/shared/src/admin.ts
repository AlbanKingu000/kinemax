import { z } from 'zod';
import { slugSchema } from './catalog.js';

// Admin panel (/api/admin/*): staff only (SUPER_ADMIN everywhere, LOCATION_MANAGER for their
// locations). The server re-checks every id against the caller's scope.

/** A location the signed-in staff member may manage (the location switcher). */
export const adminLocationSchema = z.object({
  id: z.uuid(),
  slug: slugSchema,
  name: z.string(),
  city: z.string(),
  timeZone: z.string(),
});
export type AdminLocation = z.infer<typeof adminLocationSchema>;

/** GET /api/admin/locations: every location for a super admin, the assigned ones for a manager. */
export const adminLocationsResponseSchema = z.object({
  locations: z.array(adminLocationSchema),
});
export type AdminLocationsResponse = z.infer<typeof adminLocationsResponseSchema>;
