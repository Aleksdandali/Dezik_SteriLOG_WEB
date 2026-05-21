import { useCallback, useEffect, useMemo, useState } from 'react';
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
  fetchAnalytics,
  type AnalyticsData,
  type AnalyticsPeriod,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const PERIODS: { id: AnalyticsPeriod; label: string }[] = [
  { id: 'today', label: 'Сьогодні' },
  { id: 'week', label: 'Тиждень' },
  { id: 'month', label: 'Місяць' },
];

function fmt(n: number): string {
  return Math.round(n || 0).toLocaleString('uk-UA');
}

function fmtDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

export default function AnalyticsScreen() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('week');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: AnalyticsPeriod) => {
    setError(null);
    try {
      const res = await fetchAnalytics(p);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setData(null);
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

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Аналітика', headerTintColor: colors.brand }} />

      <View style={styles.periodBar}>
        {PERIODS.map(p => {
          const active = period === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPeriod(p.id)}
              style={[styles.periodChip, active && styles.periodChipActive]}
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
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : !data ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📈</Text>
            <Text style={styles.emptyTitle}>Немає даних</Text>
          </View>
        ) : (
          <>
            <SummaryGrid data={data} />
            <DailyChart days={data.by_day} />
            <BySourceCard sources={data.by_source} />
            <ByStatusCard statuses={data.by_status} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryGrid({ data }: { data: AnalyticsData }) {
  return (
    <View style={styles.grid}>
      <Stat label="Замовлень" value={fmt(data.total_orders)} />
      <Stat label="Дохід" value={`${fmt(data.total_revenue)} ₴`} accent={colors.brand} />
      <Stat label="Сер. чек" value={`${fmt(data.avg_order)} ₴`} />
      <Stat label="Оплачено" value={`${data.paid_percent}%`} accent={colors.success} />
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

function DailyChart({ days }: { days: AnalyticsData['by_day'] }) {
  const maxRev = useMemo(() => Math.max(1, ...days.map(d => d.revenue)), [days]);
  if (days.length === 0) return null;

  // Limit to last 14 days to keep bars readable on phone screens.
  const visible = days.slice(-14);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Замовлення по днях</Text>
      <View style={styles.chart}>
        {visible.map((d, i) => {
          const h = (d.revenue / maxRev) * 120;
          return (
            <View key={i} style={styles.barColumn}>
              <View style={styles.barWrap}>
                {d.revenue > 0 && (
                  <View style={[styles.bar, { height: Math.max(2, h) }]} />
                )}
              </View>
              <Text style={styles.barLabel}>{fmtDayLabel(d.date)}</Text>
              <Text style={styles.barCount}>{d.orders}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function BySourceCard({ sources }: { sources: AnalyticsData['by_source'] }) {
  if (sources.length === 0) return null;
  const total = sources.reduce((s, x) => s + x.revenue, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Джерела</Text>
      {sources.map(s => {
        const pct = total > 0 ? (s.revenue / total) * 100 : 0;
        return (
          <View key={s.source_id} style={styles.breakdownRow}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>{s.name}</Text>
              <Text style={styles.breakdownAmount}>{fmt(s.revenue)} ₴</Text>
            </View>
            <View style={styles.breakdownSub}>
              <Text style={styles.breakdownMeta}>{s.orders} замовл.</Text>
              <Text style={styles.breakdownMeta}>{pct.toFixed(1)}%</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ByStatusCard({ statuses }: { statuses: AnalyticsData['by_status'] }) {
  if (statuses.length === 0) return null;
  const total = statuses.reduce((s, x) => s + x.count, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Статуси</Text>
      {statuses.map(s => {
        const pct = total > 0 ? (s.count / total) * 100 : 0;
        return (
          <View key={s.status_id} style={styles.breakdownRow}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel}>{s.name}</Text>
              <Text style={styles.breakdownAmount}>{s.count}</Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.success }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  center: { paddingVertical: spacing.xxl * 2, alignItems: 'center' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...text.heading, color: colors.textMuted },
  errorBox: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  errorText: { color: colors.danger, fontSize: 14 },

  periodBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  periodChip: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  periodChipActive: { backgroundColor: colors.brand },
  periodText: { fontSize: 14, color: colors.brandDark, fontWeight: '600' },
  periodTextActive: { color: colors.card, fontWeight: '700' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  statLabel: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },

  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.md, gap: spacing.sm },
  cardTitle: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: spacing.sm,
    minHeight: 160,
  },
  barColumn: { flex: 1, alignItems: 'center', gap: 2 },
  barWrap: { height: 120, justifyContent: 'flex-end', width: '100%', alignItems: 'center' },
  bar: { width: '80%', backgroundColor: colors.brand, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 9, color: colors.textFaint },
  barCount: { fontSize: 11, fontWeight: '700', color: colors.brandDark },

  breakdownRow: { gap: spacing.xs, marginTop: spacing.xs },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { ...text.body, flex: 1, marginRight: spacing.sm },
  breakdownAmount: { ...text.bodyStrong },
  breakdownSub: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownMeta: { ...text.faint },
  barTrack: { height: 6, backgroundColor: colors.divider, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: colors.brand },
});
