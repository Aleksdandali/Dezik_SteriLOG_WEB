import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import FinishedProductAudit, { type AuditSubmitItem } from '@/components/FinishedProductAudit';
import { createAudit, LOCATION_LABELS, type OpsLocation } from '@/lib/ops';
import { consumePrefill } from '@/lib/audit-prefill';
import { colors, radius, spacing, text } from '@/lib/theme';

type Phase = 'location' | 'type' | 'grid';
type AuditType = 'raw' | 'finished';

// Warehouses in the same order the bot shows them. `hasRaw` controls whether
// the type picker is shown (Afina only has finished goods).
const WAREHOUSES: { id: OpsLocation; icon: string; hasRaw: boolean }[] = [
  { id: 'malynovskogo', icon: '🏭', hasRaw: true  },
  { id: 'afina_sklad',  icon: '🏪', hasRaw: false },
  { id: 'dalnytska',    icon: '🏭', hasRaw: true  },
];

export default function NewAuditScreen() {
  const [phase, setPhase] = useState<Phase>('location');
  const [location, setLocation] = useState<OpsLocation | null>(null);
  const [type, setType] = useState<AuditType | null>(null);
  const [busy, setBusy] = useState(false);
  // Optional starting quantities when entered via "Створити заново" on a
  // rejected audit. Consumed once on mount so a stale prefill from an aborted
  // earlier flow can never leak into a fresh "Новий" tap.
  const [prefillQuantities, setPrefillQuantities] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const p = consumePrefill();
    if (!p) return;
    setLocation(p.location);
    setType(p.itemType);
    setPrefillQuantities(p.quantitiesByName);
    setPhase('grid');
  }, []);

  const warehouse = WAREHOUSES.find(w => w.id === location) ?? null;

  const pickLocation = (loc: OpsLocation) => {
    const wh = WAREHOUSES.find(w => w.id === loc);
    setLocation(loc);
    // If only finished goods are available, skip the type picker entirely.
    if (wh && !wh.hasRaw) {
      setType('finished');
      setPhase('grid');
    } else {
      setType(null);
      setPhase('type');
    }
  };

  const pickType = (t: AuditType) => {
    setType(t);
    setPhase('grid');
  };

  const back = () => {
    if (phase === 'grid') {
      // Bots without raw (Afina) skip 'type', so step back to 'location'.
      if (warehouse && !warehouse.hasRaw) {
        setLocation(null);
        setType(null);
        setPhase('location');
      } else {
        setType(null);
        setPhase('type');
      }
    } else if (phase === 'type') {
      setLocation(null);
      setPhase('location');
    } else {
      router.back();
    }
  };

  const submit = async (items: AuditSubmitItem[]) => {
    if (!location) return;
    setBusy(true);
    try {
      await createAudit({ location, items });
      Alert.alert('Готово', 'Переоблік збережено', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось зберегти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Переоблік', headerTintColor: colors.brand }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {phase === 'location' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Оберіть локацію</Text>
            <View style={styles.cardList}>
              {WAREHOUSES.map(wh => (
                <Pressable
                  key={wh.id}
                  onPress={() => pickLocation(wh.id)}
                  style={({ pressed }) => [styles.bigCard, pressed && styles.cardPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Локація ${LOCATION_LABELS[wh.id]}`}
                >
                  <Text style={styles.bigIcon}>{wh.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bigName}>{LOCATION_LABELS[wh.id]}</Text>
                    <Text style={styles.bigDesc}>
                      {wh.hasRaw ? 'Сировина + готова продукція' : 'Готова продукція'}
                    </Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {phase === 'type' && warehouse && (
          <View style={styles.section}>
            <Pressable onPress={back} style={styles.backRow} accessibilityRole="button" accessibilityLabel="Назад">
              <Text style={styles.backArrow}>‹</Text>
              <Text style={styles.backLabel}>Локація</Text>
            </Pressable>
            <Text style={styles.sectionTitle}>📝 Переоблік — {LOCATION_LABELS[warehouse.id]}</Text>
            <View style={styles.cardList}>
              <Pressable
                onPress={() => pickType('raw')}
                style={({ pressed }) => [styles.bigCard, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel="Сировина"
              >
                <Text style={styles.bigIcon}>🧱</Text>
                <Text style={styles.bigName}>Сировина</Text>
                <Text style={styles.chev}>›</Text>
              </Pressable>
              <Pressable
                onPress={() => pickType('finished')}
                style={({ pressed }) => [styles.bigCard, pressed && styles.cardPressed]}
                accessibilityRole="button"
                accessibilityLabel="Готова продукція"
              >
                <Text style={styles.bigIcon}>📦</Text>
                <Text style={styles.bigName}>Готова продукція</Text>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === 'grid' && warehouse && type && (
          <FinishedProductAudit
            warehouseName={LOCATION_LABELS[warehouse.id]}
            locationId={warehouse.id}
            itemType={type}
            submitting={busy}
            onSubmit={submit}
            onBack={back}
            initialQuantitiesByName={prefillQuantities ?? undefined}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },

  section: { gap: spacing.md },
  sectionTitle: { ...text.heading, paddingHorizontal: spacing.xs },

  cardList: { gap: spacing.sm + 4 },
  bigCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.7 },
  bigIcon: { fontSize: 28 },
  bigName: { ...text.bodyStrong, flex: 1 },
  bigDesc: { ...text.meta, marginTop: 2 },
  chev: { fontSize: 24, color: colors.textFaint, fontWeight: '600' },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  backArrow: { fontSize: 20, color: colors.brand, fontWeight: '700' },
  backLabel: { ...text.meta, color: colors.brand, fontWeight: '600' },
});
