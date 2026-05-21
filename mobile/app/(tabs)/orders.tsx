import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApiError } from '@/lib/api';
import { listOrders, cacheOrder, type Order } from '@/lib/orders';
import { colors, radius, spacing, text } from '@/lib/theme';

const STATUS_FILTERS: { id: number; label: string }[] = [
  { id: 1, label: 'Нові' },
  { id: 22, label: 'З бота' },
  { id: 8, label: 'На збірку' },
  { id: 4, label: 'Очік. оплату' },
  { id: 10, label: 'Наложка' },
  { id: 12, label: 'Виконано' },
  { id: 19, label: 'Скасовано' },
];

export default function OrdersScreen() {
  const [statusFilter, setStatusFilter] = useState<number>(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: number) => {
    try {
      setError(null);
      const data = await listOrders(status);
      data.forEach(cacheOrder);
      setOrders(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалось завантажити');
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(statusFilter);
  }, [statusFilter, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(statusFilter);
  }, [load, statusFilter]);

  const openOrder = (o: Order) => {
    cacheOrder(o);
    router.push({ pathname: '/order/[id]', params: { id: String(o.id) } });
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setStatusFilter(f.id)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={o => String(o.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.listContent}
          ListHeaderComponent={
            orders.length > 0 ? (
              <Text style={styles.countLabel}>{orders.length} замовлень</Text>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Немає замовлень у цьому статусі</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openOrder(item)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.id}>#{item.id}</Text>
                <Text style={styles.total}>{Math.round(item.total)} ₴</Text>
              </View>
              <Text style={styles.name} numberOfLines={1}>{item.recipient ?? '—'}</Text>
              {item.city && <Text style={styles.meta} numberOfLines={1}>{item.city}</Text>}
              <View style={styles.statusRow}>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{item.status_name}</Text>
                </View>
                {item.in_bot && (
                  <View style={[styles.statusBadge, styles.botBadge]}>
                    <Text style={styles.botText}>🤖 в боті</Text>
                  </View>
                )}
                {item.ttn && (
                  <View style={[styles.statusBadge, styles.ttnBadge]}>
                    <Text style={styles.ttnText}>📦 ТТН</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.danger, padding: spacing.lg, textAlign: 'center' },

  filterBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  filterChipActive: { backgroundColor: colors.brand },
  filterText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  filterTextActive: { color: colors.card, fontWeight: '700' },

  countLabel: {
    ...text.faint,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },

  row: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  rowPressed: { opacity: 0.6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { ...text.meta },
  total: { ...text.bodyStrong, color: colors.brand },
  name: { ...text.body, fontWeight: '500' },
  meta: { ...text.meta },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' },
  statusBadge: {
    backgroundColor: colors.brandTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: { fontSize: 12, color: colors.brandDark, fontWeight: '500' },
  botBadge: { backgroundColor: colors.successTint },
  botText: { fontSize: 12, color: colors.successText, fontWeight: '500' },
  ttnBadge: { backgroundColor: colors.warningTint },
  ttnText: { fontSize: 12, color: colors.warningText, fontWeight: '500' },
});
