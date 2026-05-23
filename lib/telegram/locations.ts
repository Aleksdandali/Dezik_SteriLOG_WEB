// Resolve which warehouses a staffer is allowed to see/act on. Single source
// of truth used by every route that filters by location. Don't open-code the
// "admin? home? visible?" ladder anywhere else — go through here.

import type { OpsLocation, OpsStaff } from './types';

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
 *   - non-admin, visible_locations empty → just `location` (legacy behavior)
 *   - non-admin, no `location` either → empty (block all location-scoped data)
 */
export function resolveVisibleLocations(staff: OpsStaff): OpsLocation[] {
  if (staff.role === 'admin') return ALL_LOCATIONS;

  const list = (staff.visible_locations ?? []) as OpsLocation[];
  if (list.length > 0) {
    // Make sure home is included even if admin forgot to tick it.
    if (staff.location && !list.includes(staff.location)) {
      return [staff.location, ...list];
    }
    return list;
  }

  return staff.location ? [staff.location] : [];
}

/** True if `loc` is in the staffer's effective visible set. */
export function canAccessLocation(staff: OpsStaff, loc: OpsLocation): boolean {
  return resolveVisibleLocations(staff).includes(loc);
}
