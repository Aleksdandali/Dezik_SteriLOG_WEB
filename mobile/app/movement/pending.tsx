import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  BAG_MATERIAL_LABELS,
  confirmMovement,
  listPendingMovements,
  LOCATION_LABELS,
  uploadPhoto,
  type BagMaterial,
  type OpsLocation,
  type PendingMovement,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const WAREHOUSE_LOCATIONS: OpsLocation[] = ['malynovskogo', 'dalnytska', 'afina_sklad', 'afina_ofis'];

// Group: shipment_id → array of movements. Single movements (no shipment_id)
// land under synthetic keys so each appears as its own card.
function groupByShipment(items: PendingMovement[]): { key: string; items: PendingMovement[] }[] {
  const map = new Map<string, PendingMovement[]>();
  for (const m of items) {
    const key = m.shipment_id ?? `single:${m.id}`;
    const arr = map.get(key) ?? [];
    arr.push(m);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
}

export default function MovementPendingScreen() {
  const [location, setLocation] = useState<OpsLocation>('afina_sklad');
  const [items, setItems] = useState<PendingMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (loc: OpsLocation) => {
    setError(null);
    try {
      const data = await listPendingMovements(loc);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(location).finally(() => setLoading(false));
  }, [location, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(location);
    setRefreshing(false);
  };

  const removeShipment = (key: string) => {
    setItems(prev => {
      const group = groupByShipment(prev).find(g => g.key === key);
      if (!group) return prev;
      const ids = new Set(group.items.map(i => i.id));
      return prev.filter(m => !ids.has(m.id));
    });
  };

  const groups = groupByShipment(items);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Підтвердити прибуття', headerTintColor: colors.brand }} />

      <View style={styles.locBar}>
        {WAREHOUSE_LOCATIONS.map(o => {
          const active = location === o;
          return (
            <Pressable
              key={o}
              onPress={() => setLocation(o)}
              style={[styles.locBtn, active && styles.locBtnActive]}
            >
              <Text style={[styles.locText, active && styles.locTextActive]}>
                {LOCATION_LABELS[o]}
              </Text>
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
        ) : groups.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Немає очікувань</Text>
            <Text style={styles.emptySub}>Усі прибуття підтверджено</Text>
          </View>
        ) : (
          groups.map(g => (
            <ShipmentCard
              key={g.key}
              items={g.items}
              onConfirmed={() => removeShipment(g.key)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShipmentCard({
  items,
  onConfirmed,
}: {
  items: PendingMovement[];
  onConfirmed: () => void;
}) {
  const first = items[0];
  // Pre-fill confirmed quantities with what the sender declared.
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const m of items) {
      init[m.id] = String(m.packages ?? m.quantity ?? '');
    }
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
    if (!res.canceled && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const promptPhoto = () => {
    Alert.alert('Фото при прийнятті', undefined, [
      { text: 'Зробити фото', onPress: () => pickPhoto('camera') },
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

      // Two paths to match the backend: shipment-batch vs single.
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
        // Single item inside a shipment — still send as shipment batch for parity.
        await confirmMovement({
          shipment_id: first.shipment_id,
          items: [{
            id: first.id,
            confirmed_packages: parseInt(qtys[first.id], 10) || 0,
          }],
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
        {new Date(first.created_at).toLocaleString('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
            />
          </View>
        ))}
      </View>

      <Pressable onPress={promptPhoto} style={styles.photoBox}>
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
  container: { flex: 1, backgroundColor: colors.bg },

  locBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: 0,
  },
  locBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  locBtnActive: { backgroundColor: colors.brand },
  locText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  locTextActive: { color: colors.card, fontWeight: '700' },

  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl * 2 },

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
  emptySub: { ...text.meta },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
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
