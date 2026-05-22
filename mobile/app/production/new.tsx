import { useEffect, useState } from 'react';
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
  createProduction,
  LOCATION_LABELS,
  PRODUCTION_STAGE_LABELS,
  uploadPhoto,
  type BagMaterial,
  type BagSize,
  type OpsLocation,
  type ProductionStage,
} from '@/lib/ops';
import { getStaff, type Staff } from '@/lib/auth';
import { colors, radius, spacing, text } from '@/lib/theme';

const SIZES = Object.keys(BAG_SIZE_LABELS) as BagSize[];
const MATERIALS = Object.keys(BAG_MATERIAL_LABELS) as BagMaterial[];
const PRODUCTION_LOCATIONS: OpsLocation[] = ['malynovskogo', 'dalnytska'];

export default function NewProductionScreen() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [stage, setStage] = useState<ProductionStage | null>(null);
  const [location, setLocation] = useState<OpsLocation>('malynovskogo');
  const [bagSize, setBagSize] = useState<BagSize>('100x200');
  const [material, setMaterial] = useState<BagMaterial>('transparent');
  const [km, setKm] = useState('');
  const [rolls, setRolls] = useState('');
  const [packages, setPackages] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mirror Mini App: default location to staff's location when it's a production site.
  useEffect(() => {
    getStaff().then(s => {
      setStaff(s);
      if (s?.location === 'malynovskogo' || s?.location === 'dalnytska') {
        setLocation(s.location as OpsLocation);
      }
    });
  }, []);

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
    Alert.alert('Фото результату', undefined, [
      { text: 'Зробити фото', onPress: () => pickPhoto('camera') },
      { text: 'Обрати з галереї', onPress: () => pickPhoto('library') },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const kmNum = parseFloat(km.replace(',', '.'));
  const rollsNum = parseInt(rolls, 10);
  const packagesNum = parseInt(packages, 10);

  // Backend rules: print → km OR rolls; pack → packages required; photo always required.
  const canSubmit =
    !!stage &&
    !!photoUri &&
    !busy &&
    (
      (stage === 'print' && (kmNum > 0 || rollsNum > 0)) ||
      (stage === 'pack' && packagesNum > 0)
    );

  const submit = async () => {
    if (!canSubmit || !stage) return;
    setBusy(true);
    try {
      const photo_url = await uploadPhoto(photoUri!, 'production');
      await createProduction({
        location,
        stage,
        bag_size: bagSize,
        material,
        km: stage === 'print' && kmNum > 0 ? kmNum : null,
        rolls: stage === 'print' && rollsNum > 0 ? rollsNum : null,
        packages: stage === 'pack' && packagesNum > 0 ? packagesNum : null,
        photo_url,
        notes: notes.trim() || null,
      });
      Alert.alert('Готово', 'Запис збережено', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось зберегти');
    } finally {
      setBusy(false);
    }
  };

  // Stage picker: show big cards first, like the bot.
  if (!stage) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <Stack.Screen options={{ title: 'Виробництво', headerTintColor: colors.brand }} />
        <ScrollView contentContainerStyle={styles.stagePickerScroll}>
          <Text style={styles.stagePickerHint}>Оберіть кабінет</Text>
          <View style={styles.stageGrid}>
            <Pressable
              style={({ pressed }) => [styles.stageCard, pressed && styles.cardPressed]}
              onPress={() => setStage('print')}
            >
              <Text style={styles.stageEmoji}>🖨</Text>
              <Text style={styles.stageTitle}>Друк</Text>
              <Text style={styles.stageSub}>Рулони</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.stageCard, pressed && styles.cardPressed]}
              onPress={() => setStage('pack')}
            >
              <Text style={styles.stageEmoji}>📦</Text>
              <Text style={styles.stageTitle}>Упаковка</Text>
              <Text style={styles.stageSub}>Пакети</Text>
            </Pressable>
          </View>
          {staff?.location && (
            <Text style={styles.staffHint}>
              Точка за замовчуванням: {LOCATION_LABELS[staff.location as OpsLocation] ?? staff.location}
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: `Виробництво · ${PRODUCTION_STAGE_LABELS[stage]}`,
          headerTintColor: colors.brand,
          headerLeft: () => (
            <Pressable onPress={() => setStage(null)} hitSlop={8}>
              <Text style={styles.headerBack}>‹ Назад</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Точка">
            <View style={styles.chips}>
              {PRODUCTION_LOCATIONS.map(o => {
                const active = location === o;
                return (
                  <Pressable
                    key={o}
                    onPress={() => setLocation(o)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {LOCATION_LABELS[o]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Розмір пакета (мм)">
            <View style={styles.sizeRow}>
              {SIZES.map(s => {
                const active = bagSize === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setBagSize(s)}
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
                const active = material === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMaterial(m)}
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

          {stage === 'print' ? (
            <View style={styles.row2}>
              <Field label="Кілометри">
                <TextInput
                  style={styles.input}
                  value={km}
                  onChangeText={setKm}
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Рулонів">
                <TextInput
                  style={styles.input}
                  value={rolls}
                  onChangeText={setRolls}
                  placeholder="0"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                />
              </Field>
            </View>
          ) : (
            <Field label="Кількість упаковок (1 уп = 100 шт)">
              <TextInput
                style={styles.input}
                value={packages}
                onChangeText={setPackages}
                placeholder="0"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
            </Field>
          )}

          <Field label="Примітки (необовʼязково)">
            <TextInput
              style={styles.input}
              value={notes}
              onChangeText={setNotes}
              placeholder="Коментар"
              placeholderTextColor={colors.textFaint}
            />
          </Field>

          <Field label="Фото результату">
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

  headerBack: { color: colors.brand, fontSize: 16, paddingHorizontal: spacing.md },

  stagePickerScroll: { padding: spacing.md, gap: spacing.lg },
  stagePickerHint: { ...text.meta, textAlign: 'center', paddingTop: spacing.lg },
  stageGrid: { flexDirection: 'row', gap: spacing.md },
  stageCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardPressed: { opacity: 0.7 },
  stageEmoji: { fontSize: 40 },
  stageTitle: { ...text.heading },
  stageSub: { ...text.meta },
  staffHint: { ...text.faint, textAlign: 'center' },

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

  row2: { flexDirection: 'row', gap: spacing.md },

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

  sizeRow: { flexDirection: 'row', gap: spacing.sm },
  sizeBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
  },
  sizeBtnActive: { backgroundColor: colors.brand },
  sizeText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  sizeTextActive: { color: colors.card, fontWeight: '700' },

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
