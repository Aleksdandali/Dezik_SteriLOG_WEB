import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  listShipments,
  listShipmentArchive,
  markShipped,
  uploadPhoto,
  type ArchivePeriod,
  type ArchiveShipment,
  type ShipmentOrder,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

type Tab = 'queue' | 'archive';

const ARCHIVE_PERIODS: { id: ArchivePeriod; label: string }[] = [
  { id: 'today', label: 'Сьогодні' },
  { id: 'yesterday', label: 'Вчора' },
  { id: 'week', label: 'Тиждень' },
];

function fmtNumber(n: number): string {
  return Math.round(n).toLocaleString('uk-UA');
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function paymentLabel(status: string): { text: string; bg: string; fg: string } {
  if (status === 'paid') return { text: 'Оплачено', bg: colors.successTint, fg: colors.successText };
  if (status === 'partially_paid') return { text: 'Частково', bg: colors.warningTint, fg: colors.warningText };
  if (status === 'not_paid') return { text: 'Не оплачено', bg: '#FEE2E2', fg: '#991B1B' };
  return { text: status, bg: colors.brandTint, fg: colors.brandDark };
}

export default function ShipmentsScreen() {
  const [tab, setTab] = useState<Tab>('queue');
  const [period, setPeriod] = useState<ArchivePeriod>('today');

  const [queue, setQueue] = useState<ShipmentOrder[]>([]);
  const [archive, setArchive] = useState<ArchiveShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [shippingId, setShippingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      if (tab === 'queue') {
        const data = await listShipments();
        setQueue(data);
      } else {
        const data = await listShipmentArchive(period);
        setArchive(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
    }
  }, [tab, period]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const ship = async (order: ShipmentOrder) => {
    const pickSource = (source: 'camera' | 'library') => doShip(order, source);
    Alert.alert(`Відправити #${order.id}?`, 'Зробіть фото відправлення', [
      { text: 'Зробити фото', onPress: () => pickSource('camera') },
      { text: 'Обрати з галереї', onPress: () => pickSource('library') },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  };

  const doShip = async (order: ShipmentOrder, source: 'camera' | 'library') => {
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
    if (res.canceled || !res.assets[0]) return;

    setShippingId(order.id);
    try {
      const url = await uploadPhoto(res.assets[0].uri, 'shipments');
      await markShipped(order.id, url);
      setQueue(prev => prev.filter(o => o.id !== order.id));
      setExpanded(null);
      Alert.alert('Готово', `Замовлення #${order.id} відправлено`);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось відправити');
    } finally {
      setShippingId(null);
    }
  };

  const callPhone = (phone: string | null) => {
    if (!phone) return;
    const clean = phone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {});
  };

  const renderHeader = useMemo(() => {
    if (tab === 'queue') {
      return queue.length > 0
        ? <Text style={styles.countLabel}>{queue.length} в черзі</Text>
        : null;
    }
    return archive.length > 0
      ? <Text style={styles.countLabel}>{archive.length} відправлено</Text>
      : null;
  }, [tab, queue.length, archive.length]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Відправки', headerTintColor: colors.brand }} />

      <View style={styles.tabBar}>
        <TabButton label="Черга" active={tab === 'queue'} onPress={() => setTab('queue')} />
        <TabButton label="Архів" active={tab === 'archive'} onPress={() => setTab('archive')} />
      </View>

      {tab === 'archive' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll} contentContainerStyle={styles.periodBar}>
          {ARCHIVE_PERIODS.map(p => {
            const active = period === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPeriod(p.id)}
                style={[styles.periodChip, active && styles.periodChipActive]}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : tab === 'queue' ? (
          queue.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>Черга порожня</Text>
              <Text style={styles.emptyHint}>Усі замовлення зі статусом «На збірку» з’являться тут</Text>
            </View>
          ) : (
            <>
              {renderHeader}
              {queue.map(o => (
                <QueueCard
                  key={o.id}
                  order={o}
                  expanded={expanded === o.id}
                  shipping={shippingId === o.id}
                  onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                  onShip={() => ship(o)}
                  onCall={() => callPhone(o.phone)}
                  onPhoto={uri => setLightbox(uri)}
                />
              ))}
            </>
          )
        ) : (
          archive.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📦</Text>
              <Text style={styles.emptyTitle}>Архів порожній</Text>
              <Text style={styles.emptyHint}>За цей період ще нічого не відправлено</Text>
            </View>
          ) : (
            <>
              {renderHeader}
              {archive.map(o => (
                <ArchiveCard
                  key={o.id}
                  order={o}
                  expanded={expanded === o.id}
                  onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                  onCall={() => callPhone(o.phone)}
                  onPhoto={uri => setLightbox(uri)}
                />
              ))}
            </>
          )
        )}
      </ScrollView>

      <Modal visible={!!lightbox} transparent onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lightboxOverlay} onPress={() => setLightbox(null)}>
          {lightbox && <Image source={{ uri: lightbox }} style={styles.lightboxImage} contentFit="contain" />}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const p = paymentLabel(status);
  return (
    <View style={[styles.badge, { backgroundColor: p.bg }]}>
      <Text style={[styles.badgeText, { color: p.fg }]}>{p.text}</Text>
    </View>
  );
}

function ProductRow({ product, onPhoto }: { product: { name: string; quantity: number; thumbnail: string | null; in_stock?: number | null }; onPhoto: (uri: string) => void }) {
  return (
    <View style={styles.product}>
      {product.thumbnail ? (
        <Pressable onPress={() => onPhoto(product.thumbnail!)}>
          <Image source={{ uri: product.thumbnail }} style={styles.productThumb} />
        </Pressable>
      ) : (
        <View style={[styles.productThumb, styles.productThumbEmpty]}>
          <Text style={styles.productThumbEmoji}>📦</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        <View style={styles.productMetaRow}>
          <Text style={styles.productQty}>×{product.quantity}</Text>
          {product.in_stock != null && (
            <Text style={[styles.productStock, product.in_stock < product.quantity && styles.productStockLow]}>
              склад: {product.in_stock}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function QueueCard({
  order,
  expanded,
  shipping,
  onToggle,
  onShip,
  onCall,
  onPhoto,
}: {
  order: ShipmentOrder;
  expanded: boolean;
  shipping: boolean;
  onToggle: () => void;
  onShip: () => void;
  onCall: () => void;
  onPhoto: (uri: string) => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.cardHeader, pressed && styles.cardPressed]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.orderId}>#{order.id}</Text>
          <Text style={styles.orderTotal}>{fmtNumber(order.total)} ₴</Text>
        </View>
        <Text style={styles.recipient} numberOfLines={1}>{order.recipient ?? '—'}</Text>
        {order.city && <Text style={styles.meta} numberOfLines={1}>{order.city}</Text>}
        <View style={styles.badgeRow}>
          <PaymentBadge status={order.payment_status} />
          {order.in_bot && (
            <View style={[styles.badge, { backgroundColor: colors.successTint }]}>
              <Text style={[styles.badgeText, { color: colors.successText }]}>🤖 в боті</Text>
            </View>
          )}
          {order.ttn && (
            <View style={[styles.badge, { backgroundColor: colors.warningTint }]}>
              <Text style={[styles.badgeText, { color: colors.warningText }]}>📦 ТТН</Text>
            </View>
          )}
          {order.buyer_orders_count && order.buyer_orders_count > 1 && (
            <View style={[styles.badge, { backgroundColor: colors.brandTint }]}>
              <Text style={[styles.badgeText, { color: colors.brandDark }]}>повторний ×{order.buyer_orders_count}</Text>
            </View>
          )}
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.cardBody}>
          {order.ttn && (
            <Row label="ТТН" value={order.ttn} />
          )}
          {order.phone && (
            <Pressable onPress={onCall}>
              <Row label="Телефон" value={order.phone} valueStyle={{ color: colors.brand }} />
            </Pressable>
          )}
          {order.address && <Row label="Адреса" value={order.address} />}
          {order.delivery && <Row label="Доставка" value={order.delivery} />}
          {order.buyer_comment && <Row label="Коментар клієнта" value={order.buyer_comment} />}
          {order.manager_comment && <Row label="Менеджер" value={order.manager_comment} />}

          {order.products.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Товари ({order.products.length})</Text>
              {order.products.map((p, i) => (
                <ProductRow key={i} product={p} onPhoto={onPhoto} />
              ))}
            </View>
          )}

          <Pressable
            onPress={onShip}
            disabled={shipping}
            style={({ pressed }) => [styles.shipButton, shipping && styles.shipDisabled, pressed && !shipping && styles.shipPressed]}
          >
            {shipping ? (
              <ActivityIndicator color={colors.card} />
            ) : (
              <Text style={styles.shipText}>📸 Зібрати та відправити</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ArchiveCard({
  order,
  expanded,
  onToggle,
  onCall,
  onPhoto,
}: {
  order: ArchiveShipment;
  expanded: boolean;
  onToggle: () => void;
  onCall: () => void;
  onPhoto: (uri: string) => void;
}) {
  // Try to extract photo URL from manager_comment if it contains "Фото відправки: <url>".
  const shipPhoto = useMemo(() => {
    if (!order.manager_comment) return null;
    const m = order.manager_comment.match(/https?:\/\/\S+/);
    return m ? m[0] : null;
  }, [order.manager_comment]);

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.cardHeader, pressed && styles.cardPressed]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.orderId}>#{order.id}</Text>
          <Text style={styles.orderTotal}>{fmtNumber(order.total)} ₴</Text>
        </View>
        <Text style={styles.recipient} numberOfLines={1}>{order.recipient}</Text>
        {order.city && <Text style={styles.meta} numberOfLines={1}>{order.city}</Text>}
        <Text style={styles.metaFaint}>відправлено: {fmtTime(order.completed_at)}</Text>
        <View style={styles.badgeRow}>
          <PaymentBadge status={order.payment_status} />
          {order.ttn && (
            <View style={[styles.badge, { backgroundColor: colors.warningTint }]}>
              <Text style={[styles.badgeText, { color: colors.warningText }]}>📦 ТТН</Text>
            </View>
          )}
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.cardBody}>
          {order.ttn && <Row label="ТТН" value={order.ttn} />}
          {order.phone && (
            <Pressable onPress={onCall}>
              <Row label="Телефон" value={order.phone} valueStyle={{ color: colors.brand }} />
            </Pressable>
          )}
          {order.address && <Row label="Адреса" value={order.address} />}
          {order.buyer_comment && <Row label="Коментар клієнта" value={order.buyer_comment} />}

          {order.products.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Товари ({order.products.length})</Text>
              {order.products.map((p, i) => (
                <ProductRow key={i} product={{ ...p, in_stock: null }} onPhoto={onPhoto} />
              ))}
            </View>
          )}

          {shipPhoto && (
            <Pressable onPress={() => onPhoto(shipPhoto)} style={styles.shipPhotoBox}>
              <Image source={{ uri: shipPhoto }} style={styles.shipPhoto} contentFit="cover" />
              <Text style={styles.shipPhotoHint}>Фото відправки</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Row({ label, value, valueStyle }: { label: string; value: string; valueStyle?: object }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  center: { paddingVertical: spacing.xxl * 2, alignItems: 'center' },
  error: { color: colors.danger, padding: spacing.lg, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 2, gap: spacing.sm },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { ...text.heading, color: colors.textMuted },
  emptyHint: { ...text.meta, textAlign: 'center', paddingHorizontal: spacing.xl },

  tabBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  tabButtonActive: { backgroundColor: colors.brand },
  tabText: { fontSize: 14, color: colors.brandDark, fontWeight: '600' },
  tabTextActive: { color: colors.card, fontWeight: '700' },

  periodScroll: { flexGrow: 0, flexShrink: 0 },
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 0,
  },
  periodChip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  periodChipActive: { backgroundColor: colors.brand },
  periodText: { fontSize: 13, color: colors.brandDark, fontWeight: '600' },
  periodTextActive: { color: colors.card, fontWeight: '700' },

  countLabel: {
    ...text.faint,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },

  card: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' },
  cardPressed: { opacity: 0.7 },
  cardHeader: { padding: spacing.md, gap: spacing.xs },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { ...text.meta, fontWeight: '700' },
  orderTotal: { ...text.bodyStrong, color: colors.brand },
  recipient: { ...text.body, fontWeight: '500' },
  meta: { ...text.meta },
  metaFaint: { ...text.faint },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  badgeText: { fontSize: 12, fontWeight: '500' },

  cardBody: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { gap: 2 },
  rowLabel: { ...text.faint, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.5 },
  rowValue: { ...text.body },

  section: { gap: spacing.sm, marginTop: spacing.xs },
  sectionTitle: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  product: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  productThumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.divider },
  productThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  productThumbEmoji: { fontSize: 20 },
  productName: { ...text.body, fontSize: 14 },
  productMetaRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: 2 },
  productQty: { ...text.meta, fontWeight: '600' },
  productStock: { ...text.faint },
  productStockLow: { color: colors.danger, fontWeight: '600' },

  shipButton: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  shipDisabled: { opacity: 0.5 },
  shipPressed: { opacity: 0.8 },
  shipText: { color: colors.card, fontSize: 15, fontWeight: '700' },

  shipPhotoBox: {
    marginTop: spacing.sm,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  shipPhoto: { width: '100%', height: 200 },
  shipPhotoHint: { ...text.faint, padding: spacing.sm, textAlign: 'center' },

  lightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 40 : 0,
  },
  lightboxImage: { width: '100%', height: '100%' },
});
