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
import { fetchCash, type CashData, type CashPeriod } from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const PERIODS: { id: CashPeriod; label: string }[] = [
  { id: 'today', label: 'Сьогодні' },
  { id: 'week', label: 'Тиждень' },
  { id: 'month', label: 'Місяць' },
];

const SOURCE_ICONS: Record<string, string> = {
  'Хорошоп': '🛒',
  'Вайбер': '💬',
  'Instagram': '📸',
  'Telegram': '✈️',
  'Rozetka': '🟢',
  'OLX': '📋',
  'Prom.ua': '🏪',
  'Інше': '📦',
};

const formatUah = (n: number): string =>
  new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(Math.round(n));

export default function CashScreen() {
  const [period, setPeriod] = useState<CashPeriod>('today');
  const [data, setData] = useState<CashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: CashPeriod) => {
    setError(null);
    try {
      const res = await fetchCash({ period: p });
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(period).finally(() => setLoading(false));
  }, [period, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(period);
    setRefreshing(false);
  };

  const sources = data?.by_source
    ? Object.entries(data.by_source).sort((a, b) => b[1].sum - a[1].sum)
    : [];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Каса', headerTintColor: colors.brand }} />

      <View style={styles.periodBar}>
        {PERIODS.map(p => {
          const active = period === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPeriod(p.id)}
              style={[styles.periodBtn, active && styles.periodBtnActive]}
            >
              <Text style={[styles.periodText, active && styles.periodTextActive]}>{p.label}</Text>
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
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : data ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Виторг · {periodLabel(data, period)}</Text>
              <Text style={styles.heroSum}>{formatUah(data.total_sum)} ₴</Text>
              <Text style={styles.heroMeta}>
                {data.orders_count} замовлень · відправлено: {data.shipped_count}
              </Text>
            </View>

            <View style={styles.row2}>
              <Stat
                title="Оплачено"
                value={`${formatUah(data.paid_sum)} ₴`}
                meta={`${data.paid_count} зам.`}
                color={colors.success}
              />
              <Stat
                title="Накладений"
                value={`${formatUah(data.cod_sum)} ₴`}
                meta={`${data.cod_count} зам.`}
                color={colors.warning}
              />
            </View>

            {data.other_count > 0 && (
              <Stat
                title="Інше (часткова / повернення)"
                value={`${formatUah(data.other_sum)} ₴`}
                meta={`${data.other_count} зам.`}
                color={colors.info}
                full
              />
            )}

            {data.avg_processing_hours > 0 && (
              <Stat
                title="Середня швидкість обробки"
                value={`${data.avg_processing_hours} год`}
                meta="від замовлення до відправки"
                color={colors.brand}
                full
              />
            )}

            {sources.length > 0 && (
              <View>
                <Text style={styles.sectionTitle}>За джерелом</Text>
                <View style={styles.sourceList}>
                  {sources.map(([name, s]) => (
                    <View key={name} style={styles.sourceRow}>
                      <Text style={styles.sourceIcon}>{SOURCE_ICONS[name] ?? '📦'}</Text>
                      <View style={styles.sourceBody}>
                        <Text style={styles.sourceName}>{name}</Text>
                        <Text style={styles.sourceMeta}>{s.count} зам.</Text>
                      </View>
                      <Text style={styles.sourceSum}>{formatUah(s.sum)} ₴</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function periodLabel(data: CashData, period: CashPeriod): string {
  if (period === 'today') return 'сьогодні';
  if (period === 'week') return 'тиждень';
  if (period === 'month') return data.period.from.slice(0, 7);
  return '';
}

function Stat({
  title,
  value,
  meta,
  color,
  full,
}: {
  title: string;
  value: string;
  meta?: string;
  color: string;
  full?: boolean;
}) {
  return (
    <View style={[styles.stat, full && styles.statFull]}>
      <Text style={styles.statTitle}>{title}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {meta && <Text style={styles.statMeta}>{meta}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  periodBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: 0,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: colors.brand },
  periodText: { fontSize: 14, color: colors.brandDark, fontWeight: '600' },
  periodTextActive: { color: colors.card, fontWeight: '700' },

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

  heroCard: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroLabel: { color: colors.brandTint, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroSum: { color: colors.card, fontSize: 32, fontWeight: '700' },
  heroMeta: { color: colors.brandTint, fontSize: 13 },

  row2: { flexDirection: 'row', gap: spacing.md },

  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  // `full` stats render outside the row container, so reset flex sizing.
  statFull: { flex: 0, alignSelf: 'stretch' },
  statTitle: { ...text.meta, fontWeight: '600' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statMeta: { ...text.faint },

  sectionTitle: { ...text.meta, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.sm },
  sourceList: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sourceIcon: { fontSize: 22 },
  sourceBody: { flex: 1 },
  sourceName: { ...text.body, fontWeight: '600' },
  sourceMeta: { ...text.faint },
  sourceSum: { ...text.bodyStrong, color: colors.brand },
});
