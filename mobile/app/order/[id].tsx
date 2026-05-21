import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/lib/api';
import {
  getCachedOrder,
  STATUS_NAMES,
  STATUS_TRANSITIONS,
  updateOrderStatus,
  type Order,
} from '@/lib/orders';
import { colors, radius, spacing, text } from '@/lib/theme';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const initial = id ? getCachedOrder(Number(id)) : undefined;
  const [order, setOrder] = useState<Order | undefined>(initial);
  const [busy, setBusy] = useState(false);

  if (!order) {
    return (
      <SafeAreaView style={styles.center}>
        <Stack.Screen options={{ title: `#${id}` }} />
        <Text style={styles.empty}>Замовлення не знайдено. Поверніться до списку і відкрийте знову.</Text>
      </SafeAreaView>
    );
  }

  const transitions = STATUS_TRANSITIONS[order.status_id] ?? [];

  const changeStatus = async (newStatusId: number) => {
    setBusy(true);
    try {
      await updateOrderStatus(order.id, newStatusId);
      setOrder({ ...order, status_id: newStatusId, status_name: STATUS_NAMES[newStatusId] ?? `Статус ${newStatusId}` });
    } catch (e) {
      Alert.alert('Помилка', e instanceof ApiError ? e.message : 'Не вдалось оновити статус');
    } finally {
      setBusy(false);
    }
  };

  const confirmStatusChange = (newStatusId: number) => {
    Alert.alert(
      'Змінити статус?',
      `${order.status_name}  →  ${STATUS_NAMES[newStatusId] ?? newStatusId}`,
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Так', onPress: () => changeStatus(newStatusId) },
      ],
    );
  };

  const callPhone = () => order.phone && Linking.openURL(`tel:${order.phone}`);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: `#${order.id}`, headerTintColor: colors.brand }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <Text style={styles.id}>#{order.id}</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{order.status_name}</Text>
            </View>
          </View>
          <Text style={styles.total}>{Math.round(order.total)} ₴</Text>
          {order.discount > 0 && (
            <Text style={styles.meta}>Знижка: {Math.round(order.discount)} ₴</Text>
          )}
          <Text style={styles.meta}>{new Date(order.ordered_at).toLocaleString('uk-UA')}</Text>
        </View>

        <Section title="Клієнт">
          <Row label="Імʼя" value={order.recipient} />
          <Pressable onPress={callPhone} disabled={!order.phone}>
            <Row label="Телефон" value={order.phone} link={!!order.phone} />
          </Pressable>
          {order.buyer_orders_count != null && (
            <Row label="Замовлень" value={String(order.buyer_orders_count)} />
          )}
          {order.in_bot && <Row label="Telegram-бот" value="✅ підписаний" />}
        </Section>

        <Section title="Доставка">
          <Row label="Місто" value={order.city} />
          <Row label="Адреса" value={order.address} multiline />
          {order.region && <Row label="Область" value={order.region} />}
          {order.ttn && <Row label="ТТН" value={order.ttn} />}
        </Section>

        <Section title={`Товари (${order.products.length})`}>
          {order.products.map((p, idx) => (
            <View key={idx} style={styles.product}>
              {p.thumbnail ? (
                <Image source={{ uri: p.thumbnail }} style={styles.productImg} />
              ) : (
                <View style={[styles.productImg, styles.productImgFallback]} />
              )}
              <View style={styles.productInfo}>
                <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
                {p.sku && <Text style={styles.productSku}>SKU: {p.sku}</Text>}
                <View style={styles.productLine}>
                  <Text style={styles.productQty}>{p.quantity} × {Math.round(p.price)} ₴</Text>
                  {p.in_stock != null && (
                    <Text style={[styles.stock, p.in_stock < p.quantity && styles.stockLow]}>
                      на складі: {p.in_stock}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          ))}
        </Section>

        {(order.buyer_comment || order.manager_comment) && (
          <Section title="Коментарі">
            {order.buyer_comment && <Row label="Покупець" value={order.buyer_comment} multiline />}
            {order.manager_comment && <Row label="Менеджер" value={order.manager_comment} multiline />}
          </Section>
        )}

        {transitions.length > 0 && (
          <View style={styles.actions}>
            <Text style={styles.actionsTitle}>Змінити статус</Text>
            {transitions.map(newStatusId => (
              <Pressable
                key={newStatusId}
                disabled={busy}
                onPress={() => confirmStatusChange(newStatusId)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  newStatusId === 19 && styles.actionBtnDanger,
                  pressed && styles.actionBtnPressed,
                  busy && styles.actionBtnDisabled,
                ]}
              >
                <Text style={[styles.actionText, newStatusId === 19 && styles.actionTextDanger]}>
                  {busy ? '…' : STATUS_NAMES[newStatusId] ?? `Статус ${newStatusId}`}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {busy && (
          <View style={styles.busyOverlay}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, value, multiline, link }: { label: string; value?: string | null; multiline?: boolean; link?: boolean }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, link && styles.rowValueLink]}
        numberOfLines={multiline ? undefined : 1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.bg },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl * 2, gap: spacing.md },

  headerCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { ...text.meta },
  total: { fontSize: 28, fontWeight: '700', color: colors.brand },
  meta: { ...text.meta },
  statusBadge: { backgroundColor: colors.brandTint, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.sm },
  statusText: { fontSize: 12, color: colors.brandDark, fontWeight: '600' },

  section: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  sectionTitle: {
    ...text.heading,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },

  row: { flexDirection: 'row', gap: spacing.md },
  rowLabel: { ...text.meta, width: 100 },
  rowValue: { ...text.body, flex: 1 },
  rowValueLink: { color: colors.brand },

  product: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider },
  productImg: { width: 56, height: 56, borderRadius: radius.sm, backgroundColor: colors.brandTint },
  productImgFallback: { backgroundColor: colors.surface },
  productInfo: { flex: 1, gap: 2 },
  productName: { ...text.body, fontWeight: '500' },
  productSku: { ...text.faint },
  productLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  productQty: { ...text.bodyStrong },
  stock: { ...text.faint },
  stockLow: { color: colors.danger, fontWeight: '600' },

  actions: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  actionsTitle: { ...text.heading, marginBottom: spacing.xs },
  actionBtn: {
    backgroundColor: colors.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionBtnDanger: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger },
  actionBtnPressed: { opacity: 0.7 },
  actionBtnDisabled: { opacity: 0.4 },
  actionText: { color: colors.card, fontSize: 15, fontWeight: '600' },
  actionTextDanger: { color: colors.danger },

  busyOverlay: { paddingVertical: spacing.lg, alignItems: 'center' },
});
