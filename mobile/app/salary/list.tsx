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
  listSalaries,
  SALARY_TYPE_LABELS,
  type SalaryEntry,
  type SalaryType,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

// Generate last N months (YYYY-MM), newest first.
function recentPeriods(n = 6): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const MONTH_NAMES = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

function fmtPeriod(p: string): string {
  const [y, m] = p.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('uk-UA');
}

export default function SalaryListScreen() {
  const periods = useMemo(() => recentPeriods(6), []);
  const [period, setPeriod] = useState(periods[0]);
  const [items, setItems] = useState<SalaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setError(null);
    try {
      const data = await listSalaries(p);
      setItems(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не вдалось завантажити';
      setError(msg.includes('Forbidden') ? 'Потрібна роль admin' : msg);
      setItems([]);
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

  const totals = useMemo(() => {
    const total = items.reduce((s, it) => s + (it.amount ?? 0), 0);
    const salary = items.filter(i => i.type === 'salary').reduce((s, it) => s + it.amount, 0);
    const advance = items.filter(i => i.type === 'advance').reduce((s, it) => s + it.amount, 0);
    return { total, salary, advance };
  }, [items]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Зарплати', headerTintColor: colors.brand }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodBar}>
        {periods.map(p => {
          const active = period === p;
          return (
            <Pressable
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.periodChip, active && styles.periodChipActive]}
            >
              <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>
                {fmtPeriod(p)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : (
          <>
            <View style={styles.summary}>
              <SummaryStat label="Всього" value={fmtNumber(totals.total)} hero />
              <View style={styles.summaryRow}>
                <SummaryStat label="Зарплата" value={fmtNumber(totals.salary)} />
                <SummaryStat label="Аванс" value={fmtNumber(totals.advance)} accent={colors.warning} />
              </View>
            </View>

            {items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyTitle}>За цей період порожньо</Text>
              </View>
            ) : (
              items.map(item => <Row key={item.id} item={item} />)
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryStat({
  label,
  value,
  hero,
  accent,
}: {
  label: string;
  value: string;
  hero?: boolean;
  accent?: string;
}) {
  return (
    <View style={[styles.stat, hero && styles.statHero]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, hero && styles.statValueHero, accent ? { color: accent } : null]}>
        {value} <Text style={styles.statUnit}>грн</Text>
      </Text>
    </View>
  );
}

function Row({ item }: { item: SalaryEntry }) {
  const isAdvance = item.type === 'advance';
  return (
    <View style={styles.row}>
      <View style={[styles.typeBadge, isAdvance ? styles.typeAdvance : styles.typeSalary]}>
        <Text style={[styles.typeText, isAdvance ? styles.typeAdvanceText : styles.typeSalaryText]}>
          {SALARY_TYPE_LABELS[item.type as SalaryType]}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{item.recipient?.name ?? '—'}</Text>
        {item.notes && <Text style={styles.rowNotes}>{item.notes}</Text>}
        {item.ops_staff?.name && (
          <Text style={styles.rowMeta}>видав: {item.ops_staff.name}</Text>
        )}
      </View>
      <Text style={[styles.rowAmount, isAdvance && { color: colors.warning }]}>
        {fmtNumber(item.amount)} грн
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  periodBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  periodChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  periodChipActive: { backgroundColor: colors.brand },
  periodChipText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  periodChipTextActive: { color: colors.card, fontWeight: '700' },

  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },

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

  summary: { gap: spacing.sm, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, flex: 1 },
  statHero: { flex: 0 },
  statLabel: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { ...text.bodyStrong, color: colors.brand, marginTop: 4 },
  statValueHero: { fontSize: 22 },
  statUnit: { ...text.faint, fontWeight: '400' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeSalary: { backgroundColor: colors.brandTint },
  typeAdvance: { backgroundColor: colors.warningTint },
  typeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  typeSalaryText: { color: colors.brandDark },
  typeAdvanceText: { color: colors.warningText },

  rowTitle: { ...text.bodyStrong },
  rowNotes: { ...text.meta, marginTop: 2 },
  rowMeta: { ...text.faint, marginTop: 2 },
  rowAmount: { ...text.bodyStrong, color: colors.brand },
});
