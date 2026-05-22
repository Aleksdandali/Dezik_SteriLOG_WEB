import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import {
  BAG_MATERIAL_LABELS,
  deleteEntry,
  LOCATION_LABELS,
  listProduction,
  PRODUCTION_STAGE_LABELS,
  type ProductionEntry,
  type ProductionStage,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const STAGE_FILTERS: { id: ProductionStage | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'print', label: 'Друк' },
  { id: 'pack', label: 'Упаковка' },
];

function groupByDay(entries: ProductionEntry[]): { day: string; items: ProductionEntry[] }[] {
  const map = new Map<string, ProductionEntry[]>();
  for (const e of entries) {
    const day = e.created_at.slice(0, 10);
    const arr = map.get(day) ?? [];
    arr.push(e);
    map.set(day, arr);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({ day, items }));
}

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

function formatDayLabel(day: string): string {
  if (day === TODAY) return 'Сьогодні';
  if (day === YESTERDAY) return 'Вчора';
  return new Date(day + 'T00:00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

export default function ProductionHistoryScreen() {
  const [filter, setFilter] = useState<ProductionStage | 'all'>('all');
  const [items, setItems] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [pwdTargetId, setPwdTargetId] = useState<string | null>(null);
  const [pwd, setPwd] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listProduction(30);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const visible = filter === 'all' ? items : items.filter(i => i.stage === filter);
  const groups = groupByDay(visible);

  const askDelete = (id: string) => {
    setPwd('');
    setPwdTargetId(id);
  };

  const confirmDelete = async () => {
    if (!pwdTargetId || !pwd) return;
    const id = pwdTargetId;
    setDeletingId(id);
    setPwdTargetId(null);
    try {
      await deleteEntry('production', id, pwd);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось видалити');
    } finally {
      setDeletingId(null);
      setPwd('');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Історія виробництва', headerTintColor: colors.brand }} />

      <View style={styles.filterBar}>
        {STAGE_FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{f.label}</Text>
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
            <Text style={styles.emptyTitle}>Поки порожньо</Text>
          </View>
        ) : (
          groups.map(g => (
            <View key={g.day} style={styles.dayBlock}>
              <Text style={styles.dayLabel}>{formatDayLabel(g.day)}</Text>
              {g.items.map(item => (
                <EntryCard
                  key={item.id}
                  item={item}
                  onPhoto={setLightboxUri}
                  onDelete={askDelete}
                  deleting={deletingId === item.id}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightboxUri(null)}>
          {lightboxUri && <Image source={{ uri: lightboxUri }} style={styles.lightboxImg} />}
        </Pressable>
      </Modal>

      <Modal visible={!!pwdTargetId} transparent animationType="fade" onRequestClose={() => setPwdTargetId(null)}>
        <View style={styles.pwdOverlay}>
          <View style={styles.pwdCard}>
            <Text style={styles.pwdTitle}>Видалення</Text>
            <Text style={styles.pwdHint}>Введіть пароль для підтвердження</Text>
            <TextInput
              style={styles.pwdInput}
              value={pwd}
              onChangeText={setPwd}
              placeholder="Пароль"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              autoFocus
            />
            <View style={styles.pwdRow}>
              <Pressable style={[styles.pwdBtn, styles.pwdCancel]} onPress={() => setPwdTargetId(null)}>
                <Text style={styles.pwdCancelText}>Скасувати</Text>
              </Pressable>
              <Pressable
                style={[styles.pwdBtn, styles.pwdConfirm, !pwd && styles.pwdConfirmDisabled]}
                onPress={confirmDelete}
                disabled={!pwd}
              >
                <Text style={styles.pwdConfirmText}>Видалити</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function EntryCard({
  item,
  onPhoto,
  onDelete,
  deleting,
}: {
  item: ProductionEntry;
  onPhoto: (uri: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  const isPrint = item.stage === 'print';
  const time = new Date(item.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  const numbers = isPrint
    ? `${item.km ?? '—'} км · ${item.rolls ?? '—'} рул`
    : `${item.packages ?? '—'} уп`;

  return (
    <View style={styles.entry}>
      <View style={[styles.stageBadge, isPrint ? styles.stageBadgePrint : styles.stageBadgePack]}>
        <Text style={styles.stageEmoji}>{isPrint ? '🖨' : '📦'}</Text>
      </View>
      <View style={styles.entryBody}>
        <View style={styles.entryHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryTitle}>
              {item.bag_size} {BAG_MATERIAL_LABELS[item.material]}
            </Text>
            <Text style={[styles.entryNumbers, isPrint ? styles.numbersPrint : styles.numbersPack]}>
              {numbers}
            </Text>
          </View>
          <View style={styles.entryMeta}>
            <Text style={styles.entryTime}>{time}</Text>
            <Text style={styles.entryStage}>{PRODUCTION_STAGE_LABELS[item.stage]}</Text>
          </View>
        </View>
        <Text style={styles.entrySub}>
          {LOCATION_LABELS[item.location]}
          {item.ops_staff?.name ? ` · ${item.ops_staff.name}` : ''}
        </Text>
        {item.notes && <Text style={styles.entryNotes}>{item.notes}</Text>}
        {item.photo_url && (
          <Pressable onPress={() => onPhoto(item.photo_url!)}>
            <Image source={{ uri: item.photo_url }} style={styles.entryPhoto} />
          </Pressable>
        )}
        <Pressable
          style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
          onPress={() => onDelete(item.id)}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.deleteText}>🗑  Видалити</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  filterBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: 0,
  },
  filterBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  filterBtnActive: { backgroundColor: colors.brand },
  filterText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  filterTextActive: { color: colors.card, fontWeight: '700' },

  scroll: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },

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

  dayBlock: { gap: spacing.sm },
  dayLabel: { ...text.meta, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  entry: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  stageBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageBadgePrint: { backgroundColor: colors.brandTint },
  stageBadgePack: { backgroundColor: colors.successTint },
  stageEmoji: { fontSize: 20 },
  entryBody: { flex: 1, gap: 2 },
  entryHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  entryTitle: { ...text.bodyStrong },
  entryNumbers: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  numbersPrint: { color: colors.brand },
  numbersPack: { color: colors.success },
  entryMeta: { alignItems: 'flex-end' },
  entryTime: { ...text.faint },
  entryStage: { ...text.faint, fontWeight: '600' },
  entrySub: { ...text.faint, marginTop: 2 },
  entryNotes: { ...text.meta, marginTop: spacing.xs },
  entryPhoto: { width: '100%', height: 120, borderRadius: radius.sm, marginTop: spacing.sm, resizeMode: 'cover' },

  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  lightboxImg: { width: '100%', height: '85%', resizeMode: 'contain' },

  deleteBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteText: { color: '#991B1B', fontSize: 12, fontWeight: '700' },

  pwdOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  pwdCard: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  pwdTitle: { ...text.heading },
  pwdHint: { ...text.meta },
  pwdInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  pwdRow: { flexDirection: 'row', gap: spacing.sm },
  pwdBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  pwdCancel: { backgroundColor: colors.brandTint },
  pwdCancelText: { color: colors.brandDark, fontSize: 14, fontWeight: '600' },
  pwdConfirm: { backgroundColor: colors.danger },
  pwdConfirmDisabled: { opacity: 0.5 },
  pwdConfirmText: { color: colors.card, fontSize: 14, fontWeight: '700' },
});
