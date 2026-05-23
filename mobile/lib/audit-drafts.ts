// Local persistence for in-progress audits so the operator never loses their
// count when signal drops mid-flow. Persists quantities keyed by
// `${location}::${itemType}` so each warehouse + raw/finished slot gets its
// own draft and we don't blow each other away.
//
// We piggy-back on the existing SecureStore (Keychain on iOS) instead of
// adding @react-native-async-storage as a new dep — drafts are tiny JSON,
// the extra encryption overhead is irrelevant, and we already pay for the
// import for auth tokens. clearToken() also wipes drafts on sign-out so a
// previous user's count never leaks to the next staff member on a shared
// device.

import * as SecureStore from 'expo-secure-store';
import { STORAGE } from './config';
import type { OpsLocation } from './ops';
import type { AuditItemType } from './audit-catalog';

export type DraftMap = Record<string, number>;
type AllDrafts = Record<string, DraftMap>;

function draftKey(location: OpsLocation, itemType: AuditItemType): string {
  return `${location}::${itemType}`;
}

async function readAll(): Promise<AllDrafts> {
  const raw = await SecureStore.getItemAsync(STORAGE.AUDIT_DRAFTS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as AllDrafts) : {};
  } catch {
    // Corrupt blob — drop it rather than crash the audit screen.
    return {};
  }
}

async function writeAll(all: AllDrafts): Promise<void> {
  await SecureStore.setItemAsync(STORAGE.AUDIT_DRAFTS, JSON.stringify(all));
}

export async function loadDraft(
  location: OpsLocation,
  itemType: AuditItemType,
): Promise<DraftMap | null> {
  const all = await readAll();
  const d = all[draftKey(location, itemType)];
  return d && Object.keys(d).length > 0 ? d : null;
}

/** Idempotent: pass an empty object to clear without a separate call. */
export async function saveDraft(
  location: OpsLocation,
  itemType: AuditItemType,
  quantities: DraftMap,
): Promise<void> {
  const all = await readAll();
  const key = draftKey(location, itemType);
  if (Object.keys(quantities).length === 0) {
    delete all[key];
  } else {
    all[key] = quantities;
  }
  await writeAll(all);
}

export async function clearDraft(
  location: OpsLocation,
  itemType: AuditItemType,
): Promise<void> {
  await saveDraft(location, itemType, {});
}
