import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import {
  BAG_MATERIAL_LABELS,
  confirmMovement,
  LOCATION_LABELS,
  uploadPhoto,
  type BagMaterial,
  type PendingMovement,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

type Props = {
  items: PendingMovement[];
  onConfirmed: () => void;
};

// Pending-shipment confirmation card: shows the declared quantities, lets the
// receiver adjust them, optionally attach a photo, then POSTs to
// /api/telegram/movements/confirm. Used in both /movement/pending and the new
// composite /stock screen (Вхідні tab).
export default function ShipmentCard({ items, onConfirmed }: Props) {
  const first = items[0];
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of items) init[m.id] = String(m.packages ?? m.quantity ?? '');
    return init;
  });
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
    if (!res.canceled && res.assets[0]) setPhotoUri(res.assets[0].uri);
  };

  const promptPhoto = () => {
    Alert.alert('Фото при прийнятті', undefined, [
      { text: 'Зробити фото',   onPress: () => pickPhoto('camera') },
      { text: 'Обрати з галереї', onPress: () => pickPhoto('library') },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const allQuantitiesValid = items.every(m => parseInt(qtys[m.id], 10) >= 0);
  const canConfirm = allQuantitiesValid && !busy;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const photo_url = photoUri ? await uploadPhoto(photoUri, 'movement-confirm') : undefined;

      if (first.shipment_id && items.length > 1) {
        await confirmMovement({
          shipment_id: first.shipment_id,
          items: items.map(m => ({
            id: m.id,
            confirmed_packages: parseInt(qtys[m.id], 10) || 0,
          })),
          photo_url,
        });
      } else if (first.shipment_id) {
        await confirmMovement({
          shipment_id: first.shipment_id,
          items: [{ id: first.id, confirmed_packages: parseInt(qtys[first.id], 10) || 0 }],
          photo_url,
        });
      } else {
        await confirmMovement({
          movement_id: first.id,
          confirmed_packages: parseInt(qtys[first.id], 10) || 0,
          photo_url,
        });
      }
      onConfirmed();
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось підтвердити');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardHeader}>
        {LOCATION_LABELS[first.from_location]} → {LOCATION_LABELS[first.to_location]}
      </Text>
      <Text style={styles.cardMeta}>
        {new Date(first.created_at).toLocaleString('uk-UA', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        })}
        {first.ops_staff?.name ? ` · ${first.ops_staff.name}` : ''}
      </Text>

      {first.photo_url && (
        <Image source={{ uri: first.photo_url }} style={styles.shipmentPhoto} />
      )}

      <View style={styles.itemList}>
        {items.map(m => (
          <View key={m.id} style={styles.itemRow}>
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle}>
                {m.bag_size
                  ? `${m.bag_size} ${BAG_MATERIAL_LABELS[m.material as BagMaterial] ?? ''}`
                  : m.description}
              </Text>
              <Text style={styles.itemMeta}>
                Відправлено: {m.packages ?? m.quantity ?? '—'} уп.
              </Text>
            </View>
            <TextInput
              style={styles.qtyInput}
              value={qtys[m.id]}
              onChangeText={v => setQtys(prev => ({ ...prev, [m.id]: v }))}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`Кількість для ${m.description}`}
            />
          </View>
        ))}
      </View>

      <Pressable
        onPress={promptPhoto}
        style={styles.photoBox}
        accessibilityRole="button"
        accessibilityLabel={photoUri ? 'Змінити фото' : 'Додати фото при прийнятті'}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={styles.photo} />
        ) : (
          <View style={styles.photoEmpty}>
            <Text style={styles.photoEmojiSmall}>📷</Text>
            <Text style={styles.photoHint}>Фото при прийнятті (необовʼязково)</Text>
          </View>
        )}
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.confirmBtn,
          !canConfirm && styles.confirmBtnDisabled,
          pressed && canConfirm && styles.confirmBtnPressed,
        ]}
        onPress={confirm}
        disabled={!canConfirm}
        accessibilityRole="button"
        accessibilityLabel="Підтвердити прибуття"
      >
        {busy ? (
          <ActivityIndicator color={colors.card} />
        ) : (
          <Text style={styles.confirmText}>Підтвердити прибуття</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 2,
    borderColor: colors.warningTint,
  },
  cardHeader: { ...text.bodyStrong, color: colors.brand },
  cardMeta: { ...text.faint, marginTop: -spacing.xs },

  shipmentPhoto: { width: '100%', height: 160, borderRadius: radius.md, resizeMode: 'cover' },

  itemList: { gap: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { ...text.body, fontWeight: '600' },
  itemMeta: { ...text.faint },
  qtyInput: {
    width: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },

  photoBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 120,
  },
  photoEmpty: { flex: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  photoEmojiSmall: { fontSize: 24 },
  photoHint: { ...text.meta },
  photo: { width: '100%', height: 160, resizeMode: 'cover' },

  confirmBtn: {
    backgroundColor: colors.success,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnPressed: { opacity: 0.8 },
  confirmText: { color: colors.card, fontSize: 16, fontWeight: '600' },
});
