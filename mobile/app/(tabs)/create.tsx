import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { listPendingMovements, type OpsLocation } from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

type ActionHref =
  | '/expense/new'
  | '/audit/new'
  | '/audit/queue'
  | '/supplier-payment/new'
  | '/movement/new'
  | '/movement/pending'
  | '/production/new'
  | '/production/history'
  | '/receiving/new'
  | '/stock'
  | '/cash'
  | '/salary/new'
  | '/salary/list'
  | '/history'
  | '/team'
  | '/shipments'
  | '/reports'
  | '/analytics';

type Action = {
  emoji: string;
  title: string;
  subtitle: string;
  href: ActionHref;
};

const ACTIONS: Action[] = [
  { emoji: '🏭', title: 'Виробництво', subtitle: 'Друк / упаковка', href: '/production/new' },
  { emoji: '🗂', title: 'Історія виробництва', subtitle: 'Записи за 30 днів', href: '/production/history' },
  { emoji: '📥', title: 'Приймання', subtitle: 'На склад + ТТН', href: '/receiving/new' },
  { emoji: '📦', title: 'Переміщення', subtitle: 'Між складами + фото', href: '/movement/new' },
  { emoji: '✅', title: 'Підтвердити прибуття', subtitle: 'Очікують підтвердження', href: '/movement/pending' },
  { emoji: '📊', title: 'Склад', subtitle: 'Залишки за локацією', href: '/stock' },
  { emoji: '📬', title: 'Відправки', subtitle: 'Зібрати + фото', href: '/shipments' },
  { emoji: '💰', title: 'Витрата', subtitle: 'Сума + фото чека', href: '/expense/new' },
  { emoji: '🧾', title: 'Оплата постачальнику', subtitle: 'Постачальник + сума', href: '/supplier-payment/new' },
  { emoji: '📝', title: 'Переоблік', subtitle: 'Залишки на локації', href: '/audit/new' },
  { emoji: '⚖️', title: 'Розгляд переоблiків', subtitle: 'Approve / reject (admin)', href: '/audit/queue' },
  { emoji: '💵', title: 'Каса', subtitle: 'Звіт за період', href: '/cash' },
  { emoji: '💸', title: 'Зарплата / Аванс', subtitle: 'Нарахувати (admin)', href: '/salary/new' },
  { emoji: '🧮', title: 'Зарплати — звіт', subtitle: 'По місяцях (admin)', href: '/salary/list' },
  { emoji: '📊', title: 'Звіти P&L', subtitle: 'Прибуток + витрати (admin)', href: '/reports' },
  { emoji: '📈', title: 'Аналітика', subtitle: 'Замовлення + джерела', href: '/analytics' },
  { emoji: '📋', title: 'Історія', subtitle: 'Витрати / Приймання / Перемiщ.', href: '/history' },
  { emoji: '👥', title: 'Команда', subtitle: 'Заявки + ролі (admin)', href: '/team' },
];

const PENDING_LOCATIONS: OpsLocation[] = ['malynovskogo', 'dalnytska', 'afina_sklad', 'afina_ofis'];

export default function CreateScreen() {
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const loadPending = useCallback(async () => {
    try {
      const counts = await Promise.all(PENDING_LOCATIONS.map(l => listPendingMovements(l).catch(() => [])));
      const total = counts.reduce((s, arr) => s + arr.length, 0);
      setPendingCount(total);
    } catch {
      setPendingCount(null);
    }
  }, []);

  // Refresh count whenever the user returns to this screen (e.g. after confirming one).
  useFocusEffect(useCallback(() => { loadPending(); }, [loadPending]));
  useEffect(() => { loadPending(); }, [loadPending]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {ACTIONS.map(a => {
          const showBadge = a.href === '/movement/pending' && pendingCount && pendingCount > 0;
          return (
            <Pressable
              key={a.href}
              onPress={() => router.push(a.href)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <Text style={styles.emoji}>{a.emoji}</Text>
              <View style={styles.cardBody}>
                <Text style={styles.title}>{a.title}</Text>
                <Text style={styles.subtitle}>{a.subtitle}</Text>
              </View>
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount}</Text>
                </View>
              ) : null}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  cardPressed: { opacity: 0.6 },
  emoji: { fontSize: 32 },
  cardBody: { flex: 1, gap: 2 },
  title: { ...text.heading },
  subtitle: { ...text.meta },
  chevron: { fontSize: 28, color: colors.textFaint, fontWeight: '300' },
  badge: {
    minWidth: 24,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.card, fontSize: 12, fontWeight: '700' },
});
