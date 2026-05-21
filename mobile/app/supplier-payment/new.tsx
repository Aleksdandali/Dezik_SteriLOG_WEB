import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import {
  createSupplierPayment,
  SUPPLIER_METHOD_LABELS,
  uploadPhoto,
  type SupplierPaymentMethod,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const METHODS = Object.keys(SUPPLIER_METHOD_LABELS) as SupplierPaymentMethod[];

export default function NewSupplierPaymentScreen() {
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<SupplierPaymentMethod>('card');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    Alert.alert('Фото', undefined, [
      { text: 'Зробити фото', onPress: () => pickPhoto('camera') },
      { text: 'Обрати з галереї', onPress: () => pickPhoto('library') },
      ...(photoUri ? [{ text: 'Видалити', style: 'destructive' as const, onPress: () => setPhotoUri(null) }] : []),
      { text: 'Скасувати', style: 'cancel' as const },
    ]);
  };

  const amountNum = parseFloat(amount.replace(',', '.'));
  const canSubmit = supplier.trim().length > 0 && amountNum > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const photo_url = photoUri ? await uploadPhoto(photoUri, 'supplier-payments') : null;
      await createSupplierPayment({
        supplier: supplier.trim(),
        amount: amountNum,
        method,
        description: description.trim() || null,
        photo_url,
      });
      Alert.alert('Готово', 'Оплату збережено', [
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
      <Stack.Screen options={{ title: 'Оплата постачальнику', headerTintColor: colors.brand }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Field label="Постачальник">
            <TextInput
              style={styles.input}
              value={supplier}
              onChangeText={setSupplier}
              placeholder="Назва / ПІБ"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
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

          <Field label="Спосіб оплати">
            <View style={styles.chips}>
              {METHODS.map(m => {
                const active = method === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {SUPPLIER_METHOD_LABELS[m]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Опис (необовʼязково)">
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="За що?"
              placeholderTextColor={colors.textFaint}
            />
          </Field>

          <Field label="Фото (необовʼязково)">
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
              <Text style={styles.submitText}>Зберегти оплату</Text>
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
