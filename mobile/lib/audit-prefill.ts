// In-memory hand-off between "Створити заново з відхиленого" tap in
// /audit/queue and the /audit/new screen. We can't squeeze 20+ audit items
// through expo-router's URL params and persisting through AsyncStorage is
// overkill for a one-shot navigation — so a tiny module-level slot does it.
//
// new.tsx calls consumePrefill() in its first effect so a stale prefill from
// an aborted earlier flow never bleeds into a fresh "Новий" tap.

import type { OpsLocation } from './ops';
import type { AuditItemType } from './audit-catalog';

export type AuditPrefill = {
  location: OpsLocation;
  itemType: AuditItemType;
  /** Name → quantity, matching audit-catalog product names. */
  quantitiesByName: Record<string, number>;
};

let pending: AuditPrefill | null = null;

export function setPrefill(p: AuditPrefill): void {
  pending = p;
}

export function consumePrefill(): AuditPrefill | null {
  const p = pending;
  pending = null;
  return p;
}
