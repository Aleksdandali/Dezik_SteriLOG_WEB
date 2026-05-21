import { useCallback, useEffect, useState } from 'react';
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
import { Stack } from 'expo-router';
import {
  listAudits,
  LOCATION_LABELS,
  reviewAudit,
  type AuditEntry,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'pending', label: 'Очікують' },
  { id: 'approved', label: 'Затв.' },
  { id: 'rejected', label: 'Відхил.' },
  { id: 'all', label: 'Все' },
];

const STATUS_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  pending: { bg: colors.warningTint, fg: colors.warningText, label: 'Очікує' },
  approved: { bg: colors.successTint, fg: colors.successText, label: 'Затверджено' },
  rejected: { bg: '#FEE2E2', fg: '#991B1B', label: 'Відхилено' },
};

export default function AuditQueueScreen() {
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = filter === 'all' ? items : items.filter(a => a.status === filter);

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
      <Stack.Screen options={{ title: 'Розгляд переоблiків', headerTintColor: colors.brand }} />

      <View style={styles.filterBar}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const count = f.id === 'all' ? items.length : items.filter(a => a.status === f.id).length;
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
            const badge = STATUS_BADGE[audit.status] ?? STATUS_BADGE.pending;
            const totalQty = audit.ops_inventory_audit_items.reduce((s, i) => s + i.quantity, 0);
            const busyThis = pendingId === audit.id;
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

                {audit.status === 'pending' && (
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
