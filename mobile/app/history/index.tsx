import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  BAG_MATERIAL_LABELS,
  deleteEntry,
  EXPENSE_CATEGORY_LABELS,
  listExpenses,
  listMovements,
  listReceivings,
  LOCATION_LABELS,
  type ExpenseEntry,
  type HistoryKind,
  type MovementEntry,
  type ReceivingEntry,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

type Tab = Exclude<HistoryKind, 'production'>;

const TABS: { id: Tab; label: string }[] = [
  { id: 'expenses', label: 'Витрати' },
  { id: 'receivings', label: 'Приймання' },
  { id: 'movements', label: 'Перемiщ.' },
];

type AnyEntry =
  | ({ kind: 'expenses' } & ExpenseEntry)
  | ({ kind: 'receivings' } & ReceivingEntry)
  | ({ kind: 'movements' } & MovementEntry);

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
}

function fmtNumber(n: number): string {
  return n.toLocaleString('uk-UA');
}

export default function HistoryScreen() {
  const [tab, setTab] = useState<Tab>('expenses');
  const [items, setItems] = useState<AnyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  const [pwdTarget, setPwdTarget] = useState<{ kind: Tab; id: string } | null>(null);
  const [pwd, setPwd] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (t: Tab) => {
    setError(null);
    try {
      const data: AnyEntry[] =
        t === 'expenses'
          ? (await listExpenses()).map(e => ({ kind: 'expenses' as const, ...e }))
          : t === 'receivings'
            ? (await listReceivings()).map(r => ({ kind: 'receivings' as const, ...r }))
            : (await listMovements()).map(m => ({ kind: 'movements' as const, ...m }));
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(tab).finally(() => setLoading(false));
  }, [tab, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(tab);
    setRefreshing(false);
  };

  const askDelete = (kind: Tab, id: string) => {
    setPwd('');
    setPwdTarget({ kind, id });
  };

  const confirmDelete = async () => {
    if (!pwdTarget || !pwd) return;
    const { kind, id } = pwdTarget;
    setDeletingId(id);
    setPwdTarget(null);
    try {
      await deleteEntry(kind, id, pwd);
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
      <Stack.Screen options={{ title: 'Історія', headerTintColor: colors.brand }} />

      <View style={styles.filterBar}>
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              style={[styles.filterBtn, active && styles.filterBtnActive]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{t.label}</Text>
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
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyTitle}>Поки порожньо</Text>
          </View>
        ) : (
          items.map(item => (
            <EntryCard
              key={item.id}
              item={item}
              onPhoto={setLightboxUri}
              onDelete={askDelete}
              deleting={deletingId === item.id}
            />
          ))
        )}
      </ScrollView>

      <Modal visible={!!lightboxUri} transparent animationType="fade" onRequestClose={() => setLightboxUri(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightboxUri(null)}>
          {lightboxUri && <Image source={{ uri: lightboxUri }} style={styles.lightboxImg} />}
        </Pressable>
      </Modal>

      <Modal visible={!!pwdTarget} transparent animationType="fade" onRequestClose={() => setPwdTarget(null)}>
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
              <Pressable style={[styles.pwdBtn, styles.pwdCancel]} onPress={() => setPwdTarget(null)}>
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
  item: AnyEntry;
  onPhoto: (uri: string) => void;
  onDelete: (kind: Tab, id: string) => void;
  deleting: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          {item.kind === 'expenses' && (
            <>
              <Text style={styles.title}>{EXPENSE_CATEGORY_LABELS[item.category] ?? item.category}</Text>
              <Text style={styles.meta}>{LOCATION_LABELS[item.location]}</Text>
            </>
          )}
          {item.kind === 'receivings' && (
            <>
              <Text style={styles.title}>{item.supplier}</Text>
              <Text style={styles.meta}>
                {item.quantity} шт · {LOCATION_LABELS[item.location]}
                {item.ttn ? ` · ТТН ${item.ttn}` : ''}
              </Text>
            </>
          )}
          {item.kind === 'movements' && (
            <>
              <Text style={styles.title}>
                {LOCATION_LABELS[item.from_location]} → {LOCATION_LABELS[item.to_location]}
              </Text>
              <Text style={styles.meta}>
                {item.description}
                {item.bag_size ? ` · ${item.bag_size}` : ''}
                {item.material ? ` ${BAG_MATERIAL_LABELS[item.material]}` : ''}
                {item.packages ? ` · ${item.packages} уп` : ''}
              </Text>
            </>
          )}
          {item.ops_staff?.name && <Text style={styles.faint}>{item.ops_staff.name}</Text>}
        </View>
        <View style={styles.right}>
          {item.kind !== 'movements' && (
            <Text style={styles.amount}>{fmtNumber(item.amount)} грн</Text>
          )}
          <Text style={styles.faint}>{fmtDate(item.created_at)}</Text>
        </View>
      </View>

      {item.photo_url && (
        <Pressable onPress={() => onPhoto(item.photo_url!)}>
          <Image source={{ uri: item.photo_url }} style={styles.photo} />
        </Pressable>
      )}

      <Pressable
        style={[styles.deleteBtn, deleting && styles.deleteBtnDisabled]}
        onPress={() => onDelete(item.kind, item.id)}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator color={colors.danger} />
        ) : (
          <Text style={styles.deleteText}>🗑  Видалити</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  filterBar: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
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

  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },

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

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  title: { ...text.bodyStrong },
  meta: { ...text.meta, marginTop: 2 },
  faint: { ...text.faint, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  amount: { ...text.bodyStrong, color: colors.brand },
  photo: { width: '100%', height: 120, borderRadius: radius.sm, resizeMode: 'cover' },

  deleteBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteBtnDisabled: { opacity: 0.5 },
  deleteText: { color: '#991B1B', fontSize: 12, fontWeight: '700' },

  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  lightboxImg: { width: '100%', height: '85%', resizeMode: 'contain' },

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
