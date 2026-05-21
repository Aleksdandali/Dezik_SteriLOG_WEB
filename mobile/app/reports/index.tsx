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
  CHANNEL_LABELS,
  EXPENSE_CATEGORY_LABELS,
  LOCATION_LABELS,
  fetchReport,
  type ExpenseCategory,
  type OpsLocation,
  type ReportData,
  type ReportPeriod,
  type SalesChannel,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'day', label: 'День' },
  { id: 'week', label: 'Тиждень' },
  { id: 'month', label: 'Місяць' },
];

function fmt(n: number): string {
  return Math.round(n || 0).toLocaleString('uk-UA');
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

export default function ReportsScreen() {
  const [period, setPeriod] = useState<ReportPeriod>('month');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: ReportPeriod) => {
    setError(null);
    try {
      const res = await fetchReport(p);
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не вдалось завантажити';
      setError(msg.includes('Forbidden') ? 'Потрібна роль admin' : msg);
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
      <Stack.Screen options={{ title: 'Звіти P&L', headerTintColor: colors.brand }} />

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
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyTitle}>Немає даних</Text>
          </View>
        ) : (
          <>
            <PnLCard data={data} />
            <ProfitHero profit={data.profit} />

            {Object.keys(data.expenses.byCategory).length > 0 && (
              <BreakdownCard
                title="Витрати по категоріях"
                items={Object.entries(data.expenses.byCategory).map(([k, v]) => ({
                  label: EXPENSE_CATEGORY_LABELS[k as ExpenseCategory] ?? k,
                  amount: v,
                }))}
              />
            )}

            {Object.keys(data.expenses.byLocation).length > 0 && (
              <BreakdownCard
                title="Витрати по локаціях"
                items={Object.entries(data.expenses.byLocation).map(([k, v]) => ({
                  label: LOCATION_LABELS[k as OpsLocation] ?? k,
                  amount: v,
                }))}
              />
            )}

            {Object.keys(data.cashByChannel).length > 0 && (
              <BreakdownCard
                title="Дохід по каналах"
                items={Object.entries(data.cashByChannel).map(([k, v]) => ({
                  label: CHANNEL_LABELS[k as SalesChannel] ?? k,
                  amount: v,
                }))}
                positive
              />
            )}

            {data.movements.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Переміщення ({data.movements.length})</Text>
                {data.movements.slice(0, 30).map((m, i) => (
                  <View key={i} style={[styles.movementRow, i > 0 && styles.movementDivider]}>
                    <View style={styles.movementHeader}>
                      <Text style={styles.movementRoute} numberOfLines={1}>
                        {LOCATION_LABELS[m.from_location]} → {LOCATION_LABELS[m.to_location]}
                      </Text>
                      <Text style={styles.movementMeta}>{fmtDate(m.created_at)}</Text>
                    </View>
                    <Text style={styles.movementDesc} numberOfLines={2}>
                      {m.description}{m.quantity ? ` · ${m.quantity} шт` : ''}
                    </Text>
                    {m.ops_staff?.name && (
                      <Text style={styles.movementStaff}>{m.ops_staff.name}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PnLCard({ data }: { data: ReportData }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>P&L</Text>
      <PnLRow label="Дохід" value={data.income} positive />
      <PnLRow label="Витрати" value={-data.expenses.total} />
      <PnLRow label="Постачальники" value={-data.supplierPayments} />
      <PnLRow label="Зарплати" value={-data.salaries} />
      <PnLRow label="Постійні" value={-data.fixedCosts} />
      <View style={styles.divider} />
      <View style={styles.pnlRow}>
        <Text style={styles.pnlLabelBold}>Прибуток</Text>
        <Text style={[styles.pnlValueBold, { color: data.profit >= 0 ? colors.success : colors.danger }]}>
          {fmt(data.profit)} грн
        </Text>
      </View>
    </View>
  );
}

function PnLRow({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  const color = value === 0 ? colors.textMuted : positive ? colors.success : colors.danger;
  const sign = value > 0 ? '+' : '';
  return (
    <View style={styles.pnlRow}>
      <Text style={styles.pnlLabel}>{label}</Text>
      <Text style={[styles.pnlValue, { color }]}>{sign}{fmt(value)} грн</Text>
    </View>
  );
}

function ProfitHero({ profit }: { profit: number }) {
  const pos = profit >= 0;
  return (
    <View style={[styles.hero, { backgroundColor: pos ? colors.successTint : '#FEE2E2' }]}>
      <Text style={[styles.heroLabel, { color: pos ? colors.successText : '#991B1B' }]}>
        Чистий прибуток
      </Text>
      <Text style={[styles.heroValue, { color: pos ? colors.successText : '#991B1B' }]}>
        {pos ? '+' : ''}{fmt(profit)} грн
      </Text>
    </View>
  );
}

function BreakdownCard({
  title,
  items,
  positive,
}: {
  title: string;
  items: { label: string; amount: number }[];
  positive?: boolean;
}) {
  const sorted = [...items].sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, it) => s + it.amount, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {sorted.map(it => {
        const pct = total > 0 ? (it.amount / total) * 100 : 0;
        return (
          <View key={it.label} style={styles.breakdownRow}>
            <View style={styles.breakdownHeader}>
              <Text style={styles.breakdownLabel} numberOfLines={1}>{it.label}</Text>
              <Text style={[styles.breakdownAmount, positive && { color: colors.success }]}>
                {fmt(it.amount)} грн
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${pct}%`, backgroundColor: positive ? colors.success : colors.brand },
                ]}
              />
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

  card: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.md, gap: spacing.sm },
  cardTitle: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.xs },

  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pnlLabel: { ...text.body },
  pnlValue: { ...text.bodyStrong },
  pnlLabelBold: { ...text.bodyStrong },
  pnlValueBold: { fontSize: 18, fontWeight: '700' },

  hero: {
    padding: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroValue: { fontSize: 28, fontWeight: '800' },

  breakdownRow: { gap: spacing.xs, marginTop: spacing.xs },
  breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { ...text.body, flex: 1, marginRight: spacing.sm },
  breakdownAmount: { ...text.bodyStrong, color: colors.danger },
  barTrack: { height: 6, backgroundColor: colors.divider, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },

  movementRow: { paddingVertical: spacing.sm, gap: 2 },
  movementDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  movementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movementRoute: { ...text.bodyStrong, fontSize: 14, flex: 1 },
  movementMeta: { ...text.faint },
  movementDesc: { ...text.meta },
  movementStaff: { ...text.faint, marginTop: 2 },
});
