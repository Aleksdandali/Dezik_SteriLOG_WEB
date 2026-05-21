import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import {
  AUDIT_UNITS,
  createAudit,
  LOCATION_LABELS,
  type AuditItemType,
  type OpsLocation,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const LOCATIONS = Object.keys(LOCATION_LABELS) as OpsLocation[];
const TYPES: { id: AuditItemType; label: string }[] = [
  { id: 'raw', label: 'Сировина' },
  { id: 'finished', label: 'Готова продукція' },
];

type Row = {
  item_type: AuditItemType;
  name: string;
  quantity: string;
  unit: string;
  notes: string;
};

const emptyRow = (): Row => ({ item_type: 'raw', name: '', quantity: '', unit: 'шт', notes: '' });

export default function NewAuditScreen() {
  const [location, setLocation] = useState<OpsLocation | null>(null);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);

  const update = (idx: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const remove = (idx: number) => {
    setRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const canSubmit = !!location && rows.some(r => r.name.trim() && parseFloat(r.quantity) > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const items = rows
        .filter(r => r.name.trim() && parseFloat(r.quantity) > 0)
        .map(r => ({
          item_type: r.item_type,
          name: r.name.trim(),
          quantity: parseFloat(r.quantity.replace(',', '.')),
          unit: r.unit,
          notes: r.notes.trim() || null,
        }));
      await createAudit({ location: location!, items });
      Alert.alert('Готово', 'Переоблік збережено', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось зберегти');
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toLocaleDateString('uk-UA', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Переоблік', headerTintColor: colors.brand }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.date}>{today}</Text>

          <Field label="Приміщення">
            <View style={styles.chips}>
              {LOCATIONS.map(o => {
                const active = location === o;
                return (
                  <Pressable key={o} onPress={() => setLocation(o)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{LOCATION_LABELS[o]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {rows.map((row, idx) => (
            <View key={idx} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemTitle}>Позиція #{idx + 1}</Text>
                {rows.length > 1 && (
                  <Pressable onPress={() => remove(idx)} hitSlop={8}>
                    <Text style={styles.itemRemove}>Видалити</Text>
                  </Pressable>
                )}
              </View>

              <Field label="Тип">
                <View style={styles.typeRow}>
                  {TYPES.map(t => {
                    const active = row.item_type === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() => update(idx, { item_type: t.id })}
                        style={[styles.typeBtn, active && styles.typeBtnActive]}
                      >
                        <Text style={[styles.typeBtnText, active && styles.typeBtnTextActive]}>{t.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Назва">
                <TextInput
                  style={styles.input}
                  value={row.name}
                  onChangeText={v => update(idx, { name: v })}
                  placeholder="Напр: Папір крафт 70г"
                  placeholderTextColor={colors.textFaint}
                />
              </Field>

              <View style={styles.row2}>
                <Field label="Кількість">
                  <TextInput
                    style={styles.input}
                    value={row.quantity}
                    onChangeText={v => update(idx, { quantity: v })}
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="decimal-pad"
                  />
                </Field>
                <Field label="Одиниця">
                  <View style={styles.unitRow}>
                    {AUDIT_UNITS.map(u => {
                      const active = row.unit === u;
                      return (
                        <Pressable
                          key={u}
                          onPress={() => update(idx, { unit: u })}
                          style={[styles.unitBtn, active && styles.unitBtnActive]}
                        >
                          <Text style={[styles.unitText, active && styles.unitTextActive]}>{u}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
              </View>

              <Field label="Примітки (необовʼязково)">
                <TextInput
                  style={styles.input}
                  value={row.notes}
                  onChangeText={v => update(idx, { notes: v })}
                  placeholder="Стан, пошкодження тощо"
                  placeholderTextColor={colors.textFaint}
                />
              </Field>
            </View>
          ))}

          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={() => setRows(prev => [...prev, emptyRow()])}
          >
            <Text style={styles.addBtnText}>+ Додати позицію</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.submit,
              !canSubmit && styles.submitDisabled,
              pressed && canSubmit && styles.submitPressed,
            ]}
            onPress={submit}
            disabled={!canSubmit}
          >
            {busy ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.submitText}>Зберегти переоблік</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },

  date: { ...text.meta, textTransform: 'capitalize' },

  field: { gap: spacing.sm, flex: 1 },
  fieldLabel: { ...text.meta, fontWeight: '600' },

  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
  },
  chipActive: { backgroundColor: colors.brand },
  chipText: { fontSize: 14, color: colors.brandDark, fontWeight: '500' },
  chipTextActive: { color: colors.card, fontWeight: '600' },

  itemCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { ...text.bodyStrong, color: colors.textMuted },
  itemRemove: { color: colors.danger, fontSize: 14, fontWeight: '500' },

  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: colors.brand },
  typeBtnText: { fontSize: 14, fontWeight: '500', color: colors.brandDark },
  typeBtnTextActive: { color: colors.card, fontWeight: '600' },

  row2: { flexDirection: 'row', gap: spacing.md },

  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  unitBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brandTint,
  },
  unitBtnActive: { backgroundColor: colors.brand },
  unitText: { fontSize: 13, color: colors.brandDark },
  unitTextActive: { color: colors.card, fontWeight: '600' },

  addBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
  },
  addBtnPressed: { opacity: 0.7 },
  addBtnText: { color: colors.brandDark, fontSize: 15, fontWeight: '600' },

  submit: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitDisabled: { opacity: 0.4 },
  submitPressed: { opacity: 0.8 },
  submitText: { color: colors.card, fontSize: 16, fontWeight: '600' },
});
