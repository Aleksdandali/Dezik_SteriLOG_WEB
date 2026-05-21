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
import {
  fetchStock,
  LOCATION_LABELS,
  type OpsLocation,
  type StockData,
  type StockItem,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const STOCK_LOCATIONS: OpsLocation[] = ['malynovskogo', 'dalnytska', 'afina_sklad'];

const SOURCE_LABEL: Record<string, string> = {
  keycrm: 'KeyCRM',
  audit: 'Останній переоблік',
  production: 'Виробництво (live)',
};

export default function StockScreen() {
  const [location, setLocation] = useState<OpsLocation>('afina_sklad');
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (loc: OpsLocation) => {
    setError(null);
    try {
      const res = await fetchStock(loc);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setData(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(location).finally(() => setLoading(false));
  }, [location, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(location);
    setRefreshing(false);
  };

  const items = data?.data ?? [];
  // Split visually: finished bags on top, raw materials below.
  const finished = items.filter(i => i.item_type !== 'raw');
  const raw = items.filter(i => i.item_type === 'raw');

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Склад', headerTintColor: colors.brand }} />

      <View style={styles.locBar}>
        {STOCK_LOCATIONS.map(o => {
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
        ) : data ? (
          <>
            <View style={styles.sourceCard}>
              <Text style={styles.sourceLabel}>Джерело</Text>
              <Text style={styles.sourceValue}>{SOURCE_LABEL[data.source] ?? data.source}</Text>
              {data.lastAudit && (
                <Text style={styles.sourceMeta}>
                  Останній переоблік: {data.lastAudit.date}
                </Text>
              )}
            </View>

            {items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyTitle}>Порожньо</Text>
                <Text style={styles.emptySub}>Зробіть переоблік або виробництво</Text>
              </View>
            ) : (
              <>
                {finished.length > 0 && (
                  <Section title="Готова продукція" items={finished} />
                )}
                {raw.length > 0 && (
                  <Section title="Сировина" items={raw} />
                )}
              </>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, items }: { title: string; items: StockItem[] }) {
  // Sort: zero/negative last, then by quantity desc.
  const sorted = [...items].sort((a, b) => {
    if ((a.quantity > 0) !== (b.quantity > 0)) return a.quantity > 0 ? -1 : 1;
    return b.quantity - a.quantity;
  });
  return (
    <View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.itemList}>
        {sorted.map((item, idx) => {
          const low = item.quantity <= 0;
          return (
            <View
              key={`${item.name}-${idx}`}
              style={[styles.itemRow, idx !== sorted.length - 1 && styles.itemRowDivider]}
            >
              <Text style={styles.itemName}>{item.name}</Text>
              <View style={styles.itemQtyBox}>
                <Text style={[styles.itemQty, low && styles.itemQtyLow]}>
                  {item.quantity}
                </Text>
                <Text style={styles.itemUnit}>{item.unit}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  locBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: 0,
  },
  locBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
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

  sourceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  sourceLabel: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sourceValue: { ...text.bodyStrong, color: colors.brand },
  sourceMeta: { ...text.meta },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...text.heading, color: colors.textMuted },
  emptySub: { ...text.meta },

  sectionTitle: {
    ...text.meta,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  itemList: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemName: { ...text.body, flex: 1 },
  itemQtyBox: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  itemQty: { fontSize: 18, fontWeight: '700', color: colors.brand },
  itemQtyLow: { color: colors.danger },
  itemUnit: { ...text.faint },
});
