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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  BAG_MATERIAL_LABELS,
  BAG_SIZE_LABELS,
  createMovement,
  LOCATION_LABELS,
  uploadPhoto,
  type BagMaterial,
  type BagSize,
  type OpsLocation,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const LOCATIONS = Object.keys(LOCATION_LABELS) as OpsLocation[];
const SIZES = Object.keys(BAG_SIZE_LABELS) as BagSize[];
const MATERIALS = Object.keys(BAG_MATERIAL_LABELS) as BagMaterial[];

type Row = {
  bagSize: BagSize;
  material: BagMaterial;
  packages: string;
};

const emptyRow = (): Row => ({ bagSize: '100x200', material: 'transparent', packages: '' });

// Simple shipment id — groups multi-item movements together for the dashboard.
function makeShipmentId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function NewMovementScreen() {
  const [fromLoc, setFromLoc] = useState<OpsLocation | null>(null);
  const [toLoc, setToLoc] = useState<OpsLocation | null>(null);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const update = (idx: number, patch: Partial<Row>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const remove = (idx: number) => {
    setRows(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Доступ', 'Дозвольте доступ у налаштуваннях, щоб додати фото.');
      return;
    }
    const res = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images'], allowsEditing: false });
    if (!res.canceled && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const promptPhoto = () => {
    Alert.alert('Фото вантажу', undefined, [
      { text: 'Зробити фото', onPress: () => pickPhoto('camera') },
      { text: 'Обрати з галереї', onPress: () => pickPhoto('library') },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const filledRows = rows.filter(r => parseInt(r.packages, 10) > 0);
  const totalPackages = filledRows.reduce((s, r) => s + parseInt(r.packages, 10), 0);

  const canSubmit =
    !!fromLoc && !!toLoc && fromLoc !== toLoc && filledRows.length > 0 && !!photoUri && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const photo_url = await uploadPhoto(photoUri!, 'movements');
      const shipment_id = makeShipmentId();
      // Mirror bot logic: one POST per item, sharing photo + shipment_id.
      for (const r of filledRows) {
        const packages = parseInt(r.packages.replace(',', '.'), 10);
        const description = `${packages} уп. ${r.bagSize} ${BAG_MATERIAL_LABELS[r.material]}`;
        await createMovement({
          from_location: fromLoc!,
          to_location: toLoc!,
          description,
          quantity: packages,
          photo_url,
          bag_size: r.bagSize,
          material: r.material,
          packages,
          shipment_id,
        });
      }
      Alert.alert('Готово', 'Переміщення відправлено', [
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
      <Stack.Screen options={{ title: 'Переміщення', headerTintColor: colors.brand }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.routeCard}>
            <Text style={styles.routeLabel}>Звідки</Text>
            <View style={styles.chips}>
              {LOCATIONS.map(o => {
                const active = fromLoc === o;
                return (
                  <Pressable
                    key={o}
                    onPress={() => {
                      setFromLoc(o);
                      if (o === toLoc) setToLoc(null);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {LOCATION_LABELS[o]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.arrow}>
              <Text style={styles.arrowText}>↓</Text>
            </View>

            <Text style={styles.routeLabel}>Куди</Text>
            <View style={styles.chips}>
              {LOCATIONS.filter(o => o !== fromLoc).map(o => {
                const active = toLoc === o;
                return (
                  <Pressable
                    key={o}
                    onPress={() => setToLoc(o)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {LOCATION_LABELS[o]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

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

              <Field label="Розмір">
                <View style={styles.sizeRow}>
                  {SIZES.map(s => {
                    const active = row.bagSize === s;
                    return (
                      <Pressable
                        key={s}
                        onPress={() => update(idx, { bagSize: s })}
                        style={[styles.sizeBtn, active && styles.sizeBtnActive]}
                      >
                        <Text style={[styles.sizeText, active && styles.sizeTextActive]}>{s}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Матеріал">
                <View style={styles.chips}>
                  {MATERIALS.map(m => {
                    const active = row.material === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => update(idx, { material: m })}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {BAG_MATERIAL_LABELS[m]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>

              <Field label="Кількість упаковок">
                <TextInput
                  style={styles.input}
                  value={row.packages}
                  onChangeText={v => update(idx, { packages: v })}
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
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

          <Field label="Фото вантажу">
            <Pressable onPress={promptPhoto} style={styles.photoBox}>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} />
              ) : (
                <View style={styles.photoEmpty}>
                  <Text style={styles.photoEmojiSmall}>📷</Text>
                  <Text style={styles.photoHint}>Натисніть, щоб додати</Text>
                </View>
              )}
            </Pressable>
          </Field>

          {filledRows.length > 0 && fromLoc && toLoc && (
            <View style={styles.summary}>
              {filledRows.map((r, i) => (
                <Text key={i} style={styles.summaryLine}>
                  <Text style={styles.summaryBold}>{r.packages} уп.</Text>
                  {' '}{r.bagSize} {BAG_MATERIAL_LABELS[r.material]}
                </Text>
              ))}
              <Text style={styles.summaryRoute}>
                {LOCATION_LABELS[fromLoc]} → {LOCATION_LABELS[toLoc]} · Разом: {totalPackages} уп.
              </Text>
            </View>
          )}

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
              <Text style={styles.submitText}>
                {totalPackages > 0 ? `Відправити (${totalPackages} уп.)` : 'Відправити'}
              </Text>
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

  routeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  routeLabel: { ...text.meta, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  arrow: { alignItems: 'center', paddingVertical: spacing.xs },
  arrowText: { fontSize: 22, color: colors.brand, fontWeight: '700' },

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

  sizeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sizeBtn: {
    flexBasis: '22%',
    flexGrow: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
  },
  sizeBtnActive: { backgroundColor: colors.brand },
  sizeText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  sizeTextActive: { color: colors.card, fontWeight: '700' },

  addBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
  },
  addBtnPressed: { opacity: 0.7 },
  addBtnText: { color: colors.brandDark, fontSize: 15, fontWeight: '600' },

  photoBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 180,
  },
  photoEmpty: { flex: 1, minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  photoEmojiSmall: { fontSize: 32 },
  photoHint: { ...text.meta },
  photo: { width: '100%', height: 240, resizeMode: 'cover' },

  summary: {
    backgroundColor: colors.brandTint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryLine: { fontSize: 13, color: colors.brandDark, textAlign: 'center' },
  summaryBold: { fontWeight: '700' },
  summaryRoute: { fontSize: 11, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.xs },

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
