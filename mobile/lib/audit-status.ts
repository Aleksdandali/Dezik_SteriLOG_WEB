// Single source of truth for audit-status badges across the mobile app.
// Both /audit/queue and /stock archive read from here so labels and colors
// can never drift again.
import { colors } from './theme';

export type AuditStatus = 'pending' | 'approved' | 'rejected';

export type AuditStatusBadge = { bg: string; fg: string; label: string };

export const AUDIT_STATUS_BADGE: Record<AuditStatus, AuditStatusBadge> = {
  pending:  { bg: colors.warningTint, fg: colors.warningText, label: '⏳ Очікує' },
  approved: { bg: colors.successTint, fg: colors.successText, label: '✅ Затверджено' },
  rejected: { bg: colors.dangerTint,  fg: colors.dangerText,  label: '❌ Відхилено' },
};

export function getAuditBadge(status: string | null | undefined): AuditStatusBadge {
  return AUDIT_STATUS_BADGE[(status as AuditStatus)] ?? AUDIT_STATUS_BADGE.pending;
}

/**
 * Whether the current staff member can review a given audit.
 * Rule: reviewer must be admin AND must not be the author (no self-approval).
 */
export function canReviewAudit(
  audit: { status: string; staff_id?: string | null },
  staff: { id: string; role?: string | null } | null,
): boolean {
  if (!staff) return false;
  if (staff.role !== 'admin') return false;
  if (audit.status !== 'pending') return false;
  if (audit.staff_id && audit.staff_id === staff.id) return false;
  return true;
}
