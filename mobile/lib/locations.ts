// Mirror of lib/telegram/locations.ts for the mobile app — same resolver
// semantics so UI matches what the backend will allow.

import type { Staff } from './auth';
import type { OpsLocation } from './ops';

export const ALL_LOCATIONS: OpsLocation[] = [
  'malynovskogo',
  'afina_sklad',
  'afina_ofis',
  'dalnytska',
];

/**
 * Effective visible locations for a staff member:
 *   - admin → all warehouses (visible_locations ignored)
 *   - non-admin, visible_locations non-empty → that list (+ home if missing)
 *   - non-admin, visible_locations empty → just `location`
 *   - non-admin, no `location` either → empty
 */
export function resolveVisibleLocations(staff: Staff | null): OpsLocation[] {
  if (!staff) return [];
  if (staff.role === 'admin') return ALL_LOCATIONS;

  const list = (staff.visible_locations ?? []) as OpsLocation[];
  const home = (staff.location ?? null) as OpsLocation | null;

  if (list.length > 0) {
    if (home && !list.includes(home)) return [home, ...list];
    return list;
  }

  return home ? [home] : [];
}
