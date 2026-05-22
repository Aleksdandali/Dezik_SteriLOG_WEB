import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import ShipmentCard from '@/components/ShipmentCard';
import {
  listPendingMovements,
  LOCATION_LABELS,
  type OpsLocation,
  type PendingMovement,
} from '@/lib/ops';
import { useOpsEvent } from '@/lib/realtime';
import { colors, radius, spacing, text } from '@/lib/theme';

const WAREHOUSE_LOCATIONS: OpsLocation[] = ['malynovskogo', 'dalnytska', 'afina_sklad', 'afina_ofis'];

// Group: shipment_id → array of movements. Single movements (no shipment_id)
// land under synthetic keys so each appears as its own card.
function groupByShipment(items: PendingMovement[]): { key: string; items: PendingMovement[] }[] {
  const map = new Map<string, PendingMovement[]>();
  for (const m of items) {
    const key = m.shipment_id ?? `single:${m.id}`;
    const arr = map.get(key) ?? [];
    arr.push(m);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}

export default function MovementPendingScreen() {
  const [location, setLocation] = useState<OpsLocation>('afina_sklad');
  const [items, setItems] = useState<PendingMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (loc: OpsLocation) => {
    setError(null);
    try {
      const data = await listPendingMovements(loc);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(location).finally(() => setLoading(false));
  }, [location, load]);

  // Live: refresh whenever a movement is created (for this location) or any
  // movement is confirmed (might be one of ours).
  useOpsEvent('movement.pending', payload => {
    if (payload?.to_location === location) load(location);
  });
  useOpsEvent('movement.confirmed', () => { load(location); });

  const onRefresh = async () => {
    setRefreshing(true);
    await load(location);
    setRefreshing(false);
  };

  const removeShipment = (key: string) => {
    setItems(prev => {
      const group = groupByShipment(prev).find(g => g.key === key);
      if (!group) return prev;
      const ids = new Set(group.items.map(i => i.id));
      return prev.filter(m => !ids.has(m.id));
    });
  };

  const groups = groupByShipment(items);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Підтвердити прибуття', headerTintColor: colors.brand }} />

      <View style={styles.locBar}>
        {WAREHOUSE_LOCATIONS.map(o => {
          const active = location === o;
          return (
            <Pressable
              key={o}
              onPress={() => setLocation(o)}
              style={[styles.locBtn, active && styles.locBtnActive]}
            >
              <Text style={[styles.locText, active && styles.locTextActive]}>
                {LOCATION_LABELS[o]}
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
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Немає очікувань</Text>
            <Text style={styles.emptySub}>Усі прибуття підтверджено</Text>
          </View>
        ) : (
          groups.map(g => (
            <ShipmentCard
              key={g.key}
              items={g.items}
              onConfirmed={() => removeShipment(g.key)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  locBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: 0,
  },
  locBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  locBtnActive: { backgroundColor: colors.brand },
  locText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  locTextActive: { color: colors.card, fontWeight: '700' },

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
  emptySub: { ...text.meta },
});
