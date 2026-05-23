import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getAuditProducts,
  type AuditItemType,
  type AuditProduct,
} from '@/lib/audit-catalog';
import { fetchStock, type OpsLocation } from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

export type AuditSubmitItem = {
  item_type: AuditItemType;
  name: string;
  quantity: number;
  unit: string;
};

type Props = {
  warehouseName: string;
  locationId: OpsLocation;
  itemType?: AuditItemType;
  submitting: boolean;
  onSubmit: (items: AuditSubmitItem[]) => void;
  onBack: () => void;
  /**
   * Optional seed quantities keyed by audit-catalog product name (NOT id).
   * Used by "Створити заново з відхиленого" — we get the previous audit's
   * items by name from the server, then match them against catalog ids here.
   */
  initialQuantitiesByName?: Record<string, number>;
};

// Pre-built audit grid — mirrors FinishedProductAudit in app/telegram/page.tsx.
// Each known product is one row with a numeric input. The current stock from
// `/api/telegram/stock` is loaded once and shown as a placeholder + faint label
// next to each row so the user can spot discrepancies as they type.
export default function FinishedProductAudit({
  warehouseName,
  locationId,
  itemType = 'finished',
  submitting,
  onSubmit,
  onBack,
  initialQuantitiesByName,
}: Props) {
  const products = useMemo(
    () => getAuditProducts(itemType, locationId),
    [itemType, locationId],
  );

  // Seed quantities from a prior audit (e.g. rejected → "Створити заново").
  // Match by catalog name; items the catalog no longer knows about are dropped.
  const seeded = useMemo<Record<string, string>>(() => {
    if (!initialQuantitiesByName) return {};
    const out: Record<string, string> = {};
    for (const p of products) {
      const q = initialQuantitiesByName[p.name];
      if (q != null) out[p.id] = String(q);
    }
    return out;
  }, [initialQuantitiesByName, products]);
  const [quantities, setQuantities] = useState<Record<string, string>>(seeded);
  const [expectedQty, setExpectedQty] = useState<Record<string, number>>({});
  const [loadingExpected, setLoadingExpected] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingExpected(true);
    fetchStock(locationId)
      .then(res => {
        if (cancelled) return;
        const expected: Record<string, number> = {};
        for (const item of res.data ?? []) expected[item.name] = item.quantity;
        setExpectedQty(expected);
      })
      .catch(() => { /* expected stays empty — placeholders fall back to "—" */ })
      .finally(() => { if (!cancelled) setLoadingExpected(false); });
    return () => { cancelled = true; };
  }, [locationId]);

  const setQty = (id: string, val: string) => {
    // Allow digits and one decimal separator (. or ,) — kept as string so the
    // user can backspace to empty without us substituting a zero.
    const clean = val.replace(/[^0-9.,]/g, '').replace(',', '.');
    setQuantities(prev => ({ ...prev, [id]: clean }));
  };

  const filledIds = useMemo(
    () => products.filter(p => quantities[p.id] !== '' && quantities[p.id] !== undefined).map(p => p.id),
    [products, quantities],
  );
  const filledCount = filledIds.length;

  const diffs = useMemo(() => {
    return products
      .filter(p => quantities[p.id] !== '' && quantities[p.id] !== undefined)
      .map(p => {
        const actual = parseFloat(quantities[p.id]) || 0;
        const expected = expectedQty[p.name] ?? 0;
        return { name: p.name, actual, expected, diff: actual - expected, unit: p.unit };
      })
      .filter(d => d.diff !== 0);
  }, [products, quantities, expectedQty]);

  // Preserve catalog group order (first-seen wins).
  const groups = useMemo(() => {
    const seen: string[] = [];
    for (const p of products) if (!seen.includes(p.group)) seen.push(p.group);
    return seen;
  }, [products]);

  const today = new Date().toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const handleSubmit = () => {
    const items: AuditSubmitItem[] = products
      .filter(p => quantities[p.id] !== '' && quantities[p.id] !== undefined)
      .map(p => ({
        item_type: itemType,
        name: p.name,
        quantity: parseFloat(quantities[p.id]) || 0,
        unit: p.unit,
      }));
    if (items.length > 0) onSubmit(items);
  };

  const disabled = filledCount === 0 || submitting;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{itemType === 'raw' ? '🧱' : '📦'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>
            Переоблік — {itemType === 'raw' ? 'Сировина' : 'Готова продукція'}
          </Text>
          <Text style={styles.headerSub}>{warehouseName}</Text>
        </View>
      </View>

      <Text style={styles.date}>{today}</Text>

      {groups.map(group => {
        const groupProducts = products.filter(p => p.group === group);
        return (
          <View key={group} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group}</Text>
            </View>
            <View style={styles.groupBody}>
              {groupProducts.map((p, idx) => (
                <Row
                  key={p.id}
                  product={p}
                  value={quantities[p.id] ?? ''}
                  expected={expectedQty[p.name]}
                  showExpected={!loadingExpected && expectedQty[p.name] !== undefined}
                  onChange={v => setQty(p.id, v)}
                  isLast={idx === groupProducts.length - 1}
                />
              ))}
            </View>
          </View>
        );
      })}

      {filledCount > 0 && (
        <View style={styles.summaryBlock}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>
              Заповнено <Text style={styles.summaryStrong}>{filledCount}</Text> з {products.length}
            </Text>
          </View>
          {diffs.length > 0 && (
            <View style={styles.diffCard}>
              <Text style={styles.diffTitle}>Розбіжності</Text>
              {diffs.map(d => (
                <View key={d.name} style={styles.diffRow}>
                  <Text style={styles.diffName} numberOfLines={1}>{d.name}</Text>
                  <Text style={styles.diffValue}>
                    {d.diff > 0 ? '+' : ''}{d.diff} {d.unit}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.submit,
          disabled && styles.submitDisabled,
          pressed && !disabled && styles.submitPressed,
        ]}
        onPress={handleSubmit}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Зберегти переоблік. Заповнено ${filledCount} позицій`}
      >
        {submitting ? (
          <ActivityIndicator color={colors.card} />
        ) : (
          <Text style={styles.submitText}>
            Зберегти переоблік{filledCount > 0 ? ` (${filledCount})` : ''}
          </Text>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Назад"
      >
        <Text style={styles.backText}>← Назад</Text>
      </Pressable>
    </View>
  );
}

// One product row. Kept inline because it's tightly coupled to the parent
// styles and visual states (neutral / match / mismatch).
function Row({
  product,
  value,
  expected,
  showExpected,
  onChange,
  isLast,
}: {
  product: AuditProduct;
  value: string;
  expected: number | undefined;
  showExpected: boolean;
  onChange: (v: string) => void;
  isLast: boolean;
}) {
  const hasValue = value !== '' && parseFloat(value) >= 0 && !Number.isNaN(parseFloat(value));
  const actual = parseFloat(value);
  const isMismatch = hasValue && expected !== undefined && actual !== expected;
  const isMatch = hasValue && expected !== undefined && actual === expected;

  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      {product.color && (
        <View style={[styles.dot, { backgroundColor: product.color }]} />
      )}
      <Text style={styles.rowName} numberOfLines={2}>{product.name}</Text>
      {showExpected && (
        <Text style={styles.expected}>{expected}</Text>
      )}
      <View style={styles.inputWrap}>
        <TextInput
          style={[
            styles.input,
            hasValue && (isMismatch ? styles.inputMismatch : styles.inputMatch),
          ]}
          value={value}
          onChangeText={onChange}
          placeholder={expected !== undefined ? String(expected) : '—'}
          placeholderTextColor={colors.textFaint}
          keyboardType="decimal-pad"
          returnKeyType="done"
          accessibilityLabel={`${product.name}, кількість`}
        />
        <Text style={styles.unit}>{product.unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerIcon: { fontSize: 28 },
  headerTitle: { ...text.heading },
  headerSub: { ...text.meta, marginTop: 2 },

  date: { ...text.meta, textTransform: 'capitalize', paddingHorizontal: spacing.xs },

  groupCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  groupHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  groupTitle: { fontSize: 13, fontWeight: '700', color: colors.brand },
  groupBody: { paddingHorizontal: spacing.sm + 4 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowName: { ...text.body, fontSize: 13, fontWeight: '500', flex: 1 },
  expected: {
    fontSize: 12,
    color: colors.textFaint,
    minWidth: 40,
    textAlign: 'right',
  },

  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    width: 76,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  inputMatch: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTint,
    color: colors.brand,
  },
  inputMismatch: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerTint,
    color: colors.danger,
  },
  unit: { fontSize: 11, color: colors.textFaint, minWidth: 22 },

  summaryBlock: { gap: spacing.sm },
  summaryCard: {
    backgroundColor: colors.brandTint,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
  },
  summaryText: { fontSize: 13, color: colors.brandDark },
  summaryStrong: { fontWeight: '700' },

  diffCard: {
    backgroundColor: colors.dangerTint,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    gap: 2,
  },
  diffTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.dangerText,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  diffRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
    gap: spacing.sm,
  },
  diffName: { fontSize: 13, color: colors.dangerText, flex: 1 },
  diffValue: { fontSize: 13, fontWeight: '700', color: colors.danger },

  submit: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: { opacity: 0.4 },
  submitPressed: { opacity: 0.85 },
  submitText: { color: colors.card, fontSize: 16, fontWeight: '600' },

  back: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  backPressed: { opacity: 0.6 },
  backText: { color: colors.brandDark, fontSize: 14, fontWeight: '500' },
});
