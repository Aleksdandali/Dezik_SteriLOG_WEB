import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import {
  listAudits,
  LOCATION_LABELS,
  reviewAudit,
  type AuditEntry,
  type OpsLocation,
} from '@/lib/ops';
import { canReviewAudit, getAuditBadge } from '@/lib/audit-status';
import { getStaff, type Staff } from '@/lib/auth';
import { useOpsEvent } from '@/lib/realtime';
import { resolveVisibleLocations } from '@/lib/locations';
import { colors, radius, spacing, text } from '@/lib/theme';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';
type LocationFilter = OpsLocation | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'pending', label: 'Очікують' },
  { id: 'approved', label: 'Затверджені' },
  { id: 'rejected', label: 'Відхилені' },
  { id: 'all', label: 'Всі' },
];

export default function AuditQueueScreen() {
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [locFilter, setLocFilter] = useState<LocationFilter>('all');
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => { getStaff().then(setStaff); }, []);

  // Warehouses the staffer is allowed to see. Drives the chip switcher.
  // Single warehouse = no switcher (just header label). >1 = chips with 'Всі'.
  const allowedLocs = useMemo(() => resolveVisibleLocations(staff), [staff]);
  const showLocChips = allowedLocs.length > 1;

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listAudits();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  // Live updates: another device creates or reviews an audit → reload list so
  // the queue never shows stale pending/approved/rejected counts.
  useOpsEvent('audit.created', () => { load(); });
  useOpsEvent('audit.reviewed', () => { load(); });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Two-stage filter: first by warehouse access (always), then by status +
  // currently-selected location chip.
  const scopedToAllowed = useMemo(
    () => (staff?.role === 'admin' ? items : items.filter(a => allowedLocs.includes(a.location))),
    [items, staff, allowedLocs],
  );
  const visible = useMemo(() => {
    let v = scopedToAllowed;
    if (locFilter !== 'all') v = v.filter(a => a.location === locFilter);
    if (filter !== 'all') v = v.filter(a => a.status === filter);
    return v;
  }, [scopedToAllowed, locFilter, filter]);

  const review = async (audit: AuditEntry, action: 'approve' | 'reject') => {
    setPendingId(audit.id);
    try {
      await reviewAudit(audit.id, action);
      setItems(prev => prev.map(a =>
        a.id === audit.id ? { ...a, status: action === 'approve' ? 'approved' : 'rejected' } : a,
      ));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Помилка';
      Alert.alert('Помилка', msg.includes('Admin only') ? 'Потрібна роль admin' : msg);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Переоблiки',
          headerTintColor: colors.brand,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/audit/new')}
              accessibilityRole="button"
              accessibilityLabel="Новий переоблік"
              style={({ pressed }) => [styles.newBtn, pressed && styles.newBtnPressed]}
            >
              <Text style={styles.newBtnText}>+ Новий</Text>
            </Pressable>
          ),
        }}
      />

      {showLocChips && (
        // Warehouse chip switcher — only when staffer has access to >1
        // location (admins always; cross-site staffers via visible_locations).
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.locBar}
        >
          {(['all', ...allowedLocs] as LocationFilter[]).map(loc => {
            const active = locFilter === loc;
            const label = loc === 'all' ? 'Всі' : LOCATION_LABELS[loc];
            const count = loc === 'all'
              ? scopedToAllowed.length
              : scopedToAllowed.filter(a => a.location === loc).length;
            return (
              <Pressable
                key={loc}
                onPress={() => setLocFilter(loc)}
                style={[styles.locChip, active && styles.locChipActive]}
                accessibilityRole="button"
              >
                <Text style={[styles.locChipText, active && styles.locChipTextActive]}>
                  {label}{count > 0 ? ` · ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.filterBar}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const base = locFilter === 'all'
            ? scopedToAllowed
            : scopedToAllowed.filter(a => a.location === locFilter);
          const count = f.id === 'all' ? base.length : base.filter(a => a.status === f.id).length;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label} {count > 0 ? `(${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Порожньо</Text>
          </View>
        ) : (
          visible.map(audit => {
            const expanded = expandedId === audit.id;
            const badge = getAuditBadge(audit.status);
            const totalQty = audit.ops_inventory_audit_items.reduce((s, i) => s + i.quantity, 0);
            const busyThis = pendingId === audit.id;
            const canReview = canReviewAudit(audit, staff);
            return (
              <View key={audit.id} style={styles.card}>
                <Pressable onPress={() => setExpandedId(expanded ? null : audit.id)}>
                  <View style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>{LOCATION_LABELS[audit.location]}</Text>
                      <Text style={styles.cardMeta}>
                        {audit.audit_date}
                        {audit.ops_staff?.name ? ` · ${audit.ops_staff.name}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.statusText, { color: badge.fg }]}>{badge.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardSummary}>
                    {audit.ops_inventory_audit_items.length} позицій · разом {totalQty}
                    <Text style={styles.chevron}>{expanded ? '  ▾' : '  ›'}</Text>
                  </Text>
                  {audit.delta_summary && (
                    // Δ vs minulého schválenia — 0 змін = підозріло, >=50% = check
                    <Text style={[
                      styles.cardDelta,
                      audit.delta_summary.items_with_delta === 0
                        ? styles.cardDeltaSuspicious
                        : audit.delta_summary.largest_delta_pct >= 50
                        ? styles.cardDeltaWarn
                        : undefined,
                    ]}>
                      {audit.delta_summary.items_with_delta === 0
                        ? '⚠️ Δ = 0 vs минулого переобліку'
                        : `Δ ${audit.delta_summary.items_with_delta} поз. · max ${audit.delta_summary.largest_delta_pct}%`}
                    </Text>
                  )}
                </Pressable>

                {expanded && (
                  <View style={styles.itemList}>
                    {audit.ops_inventory_audit_items.map((it, i) => (
                      <View key={i} style={styles.itemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>
                            {it.item_type === 'raw' ? '🧱 ' : '📦 '}{it.name}
                          </Text>
                          {it.notes && <Text style={styles.itemNotes}>{it.notes}</Text>}
                        </View>
                        <Text style={styles.itemQty}>{it.quantity} {it.unit}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {canReview && (
                  <View style={styles.actionsRow}>
                    <Pressable
                      style={[styles.actionBtn, styles.actionReject, busyThis && styles.actionDisabled]}
                      onPress={() => review(audit, 'reject')}
                      disabled={busyThis}
                    >
                      <Text style={styles.actionRejectText}>Відхилити</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionApprove, busyThis && styles.actionDisabled]}
                      onPress={() => review(audit, 'approve')}
                      disabled={busyThis}
                    >
                      {busyThis ? (
                        <ActivityIndicator color={colors.card} />
                      ) : (
                        <Text style={styles.actionApproveText}>Затвердити</Text>
                      )}
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  newBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    marginRight: spacing.sm,
  },
  newBtnPressed: { opacity: 0.7 },
  newBtnText: { color: colors.card, fontWeight: '700', fontSize: 13 },

  locBar: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  locChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  locChipActive: { backgroundColor: colors.brandDark },
  locChipText: { fontSize: 12, color: colors.brandDark, fontWeight: '600' },
  locChipTextActive: { color: colors.card, fontWeight: '700' },

  filterBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.md,
    paddingBottom: 0,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: colors.brand },
  filterText: { fontSize: 12, color: colors.brandDark, fontWeight: '600' },
  filterTextActive: { color: colors.card, fontWeight: '700' },

  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl * 2 },

  center: { paddingVertical: spacing.xxl * 2, alignItems: 'center' },
  errorBox: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  errorText: { color: colors.danger, fontSize: 14 },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...text.heading, color: colors.textMuted },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { ...text.bodyStrong },
  cardMeta: { ...text.meta, marginTop: 2 },
  cardSummary: { ...text.meta, marginTop: spacing.xs },
  cardDelta: { ...text.meta, marginTop: 2, fontWeight: '500' },
  cardDeltaSuspicious: { color: '#B45309' },
  cardDeltaWarn: { color: '#B91C1C' },
  chevron: { color: colors.textFaint },

  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

  itemList: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  itemName: { ...text.body, fontWeight: '500' },
  itemNotes: { ...text.faint, marginTop: 2 },
  itemQty: { ...text.bodyStrong, color: colors.brand },

  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionReject: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  actionRejectText: { color: '#991B1B', fontSize: 14, fontWeight: '600' },
  actionApprove: { backgroundColor: colors.success },
  actionApproveText: { color: colors.card, fontSize: 14, fontWeight: '600' },
  actionDisabled: { opacity: 0.5 },
});
