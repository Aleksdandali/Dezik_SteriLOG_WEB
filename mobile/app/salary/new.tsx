import { useEffect, useMemo, useState } from 'react';
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
  createSalary,
  listStaff,
  SALARY_TYPE_LABELS,
  type SalaryType,
  type Staff,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const TYPES: SalaryType[] = ['salary', 'advance'];

export default function NewSalaryScreen() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [type, setType] = useState<SalaryType>('salary');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const period = useMemo(() => new Date().toISOString().slice(0, 7), []);

  useEffect(() => {
    (async () => {
      try {
        const data = await listStaff();
        setStaff(data);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      } finally {
        setLoadingStaff(false);
      }
    })();
  }, []);

  const amountNum = parseFloat(amount.replace(',', '.'));
  const canSubmit = !!recipientId && amountNum > 0 && !busy;

  const submit = async () => {
    if (!canSubmit || !recipientId) return;
    setBusy(true);
    try {
      await createSalary({
        recipient_id: recipientId,
        amount: amountNum,
        type,
        period,
        notes: notes.trim() || null,
      });
      Alert.alert('Готово', `${SALARY_TYPE_LABELS[type]} нараховано`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не вдалось зберегти';
      Alert.alert('Помилка', msg.includes('Forbidden') ? 'Потрібна роль admin' : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Зарплата / Аванс', headerTintColor: colors.brand }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.periodBox}>
            <Text style={styles.periodLabel}>Період</Text>
            <Text style={styles.periodValue}>{period}</Text>
          </View>

          <Field label="Отримувач">
            {loadingStaff ? (
              <View style={styles.loadBox}><ActivityIndicator color={colors.brand} /></View>
            ) : loadError ? (
              <Text style={styles.errorText}>{loadError}</Text>
            ) : staff.length === 0 ? (
              <Text style={text.meta}>Немає активних співробітників</Text>
            ) : (
              <View style={styles.chips}>
                {staff.map(s => {
                  const active = recipientId === s.id;
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setRecipientId(s.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {s.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Field>

          <Field label="Тип">
            <View style={styles.chips}>
              {TYPES.map(t => {
                const active = type === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {SALARY_TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Сума (грн)">
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Нотатки (необовʼязково)">
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Коментар"
              placeholderTextColor={colors.textFaint}
              multiline
            />
          </Field>

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
              <Text style={styles.submitText}>Зберегти</Text>
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

  periodBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  periodLabel: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  periodValue: { ...text.bodyStrong, color: colors.brand, fontSize: 18 },

  field: { gap: spacing.sm },
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
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

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

  loadBox: { paddingVertical: spacing.lg, alignItems: 'center' },
  errorText: { color: colors.danger, fontSize: 14 },

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
