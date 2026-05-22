import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import {
  fetchBotClientsCount,
  fetchCashToday,
  fetchNewOrdersCount,
  fetchPendingAuditsCount,
  fetchShipmentCount,
  fetchUnreadCount,
  listPendingMovements,
  type OpsLocation,
} from '@/lib/ops';
import { getStaff, type Staff } from '@/lib/auth';
import { STORAGE } from '@/lib/config';
import { colors } from '@/lib/theme';

// ── Routing ────────────────────────────────────────────
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
  | '/stock-dashboard'
  | '/cash'
  | '/salary/new'
  | '/salary/list'
  | '/history'
  | '/team'
  | '/shipments'
  | '/reports'
  | '/analytics'
  | '/fop-docs'
  | '/orders'
  | '/chat';

type BadgeKey =
  | 'shipments'
  | 'newOrders'
  | 'unread'
  | 'pendingMovements'
  | 'pendingAudits';

type IconName = keyof typeof Ionicons.glyphMap;

type MainItem = {
  icon: IconName;
  label: string;
  desc: string;
  href: ActionHref;
  color: string;
  badgeKey?: BadgeKey;
  /** Maps to bot's `visible_sections` (1:1 with bot view names) so role/section gating works. */
  section: string;
};

type SecondaryItem = {
  icon: IconName;
  label: string;
  href: ActionHref;
  adminOnly?: boolean;
  badgeKey?: BadgeKey;
  section: string;
};

const PENDING_LOCATIONS: OpsLocation[] = ['malynovskogo', 'dalnytska', 'afina_sklad', 'afina_ofis'];
const UNREAD_REFRESH_MS = 30_000; // Matches MainMenu in app/telegram/page.tsx.

// Order + sections mirror MainMenu in app/telegram/page.tsx.
const MAIN_ITEMS: MainItem[] = [
  { icon: 'cube', label: 'Виробництво', desc: 'Друк / Упаковка', href: '/production/new', color: '#4b569e', section: 'production' },
  { icon: 'swap-horizontal', label: 'Переміщення', desc: 'Між точками', href: '/movement/new', color: '#3B82F6', section: 'movement' },
  { icon: 'archive', label: 'Склад', desc: 'Вхідні / Залишки', href: '/stock', color: '#10B981', section: 'warehouse' },
  { icon: 'stats-chart', label: 'Залишки', desc: 'Всі локації', href: '/stock-dashboard', color: '#8B5CF6', section: 'stock-dashboard' },
  { icon: 'download', label: 'Приймання', desc: 'Від постачальника', href: '/receiving/new', color: '#F59E0B', section: 'receiving' },
  { icon: 'receipt', label: 'Замовлення', desc: 'Обробка KeyCRM', href: '/orders', color: '#3B82F6', badgeKey: 'newOrders', section: 'orders' },
  { icon: 'paper-plane', label: 'Відправки', desc: 'На збірку', href: '/shipments', color: '#F59E0B', badgeKey: 'shipments', section: 'shipments' },
  { icon: 'cash', label: 'Каса', desc: 'Продажі', href: '/cash', color: '#10B981', section: 'cash-report' },
  { icon: 'wallet', label: 'Витрати', desc: 'Записати витрату', href: '/expense/new', color: '#EF4444', section: 'expense' },
  { icon: 'chatbubble-ellipses', label: 'Повідомлення', desc: 'Чати з клієнтами', href: '/chat', color: '#4b569e', badgeKey: 'unread', section: 'messages' },
];

const SECONDARY_ITEMS: SecondaryItem[] = [
  { icon: 'card', label: 'Оплати постач.', href: '/supplier-payment/new', section: 'supplier-payment' },
  { icon: 'checkmark-circle', label: 'Підтвердити прибуття', href: '/movement/pending', badgeKey: 'pendingMovements', section: 'movement' },
  { icon: 'clipboard', label: 'Переоблік', href: '/audit/new', badgeKey: 'pendingAudits', section: 'inventory-audit' },
  { icon: 'shield-checkmark', label: 'Розгляд переоблiків', href: '/audit/queue', adminOnly: true, section: 'inventory-audit' },
  { icon: 'time', label: 'Історія виробництва', href: '/production/history', section: 'production' },
  { icon: 'file-tray-full', label: 'Історія', href: '/history', section: 'history' },
  { icon: 'cash-outline', label: 'Зарплати', href: '/salary/list', adminOnly: true, section: 'salary' },
  { icon: 'people', label: 'Команда', href: '/team', adminOnly: true, section: 'team' },
  { icon: 'bar-chart', label: 'Звіти P&L', href: '/reports', adminOnly: true, section: 'reports' },
  { icon: 'trending-up', label: 'Аналітика', href: '/analytics', adminOnly: true, section: 'analytics' },
  { icon: 'document-text', label: 'Документи ФОП', href: '/fop-docs', adminOnly: true, section: 'fop-docs' },
];

// Color hex + 0x12 (≈ 7% alpha) — same as the bot's inline `${color}12` style.
const tintBg = (hex: string) => `${hex}12`;

function fmtBadge(n: number): string {
  return n > 99 ? '99+' : String(n);
}

function fmtCashLine(cash: number): string {
  return cash > 0 ? `${Math.round(cash).toLocaleString('uk-UA')} грн` : 'Продажі';
}

export default function CreateScreen() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [counts, setCounts] = useState<Record<BadgeKey, number>>({
    shipments: 0,
    newOrders: 0,
    unread: 0,
    pendingMovements: 0,
    pendingAudits: 0,
  });
  const [botClients, setBotClients] = useState(0);
  const [cashToday, setCashToday] = useState(0);

  // Live ref so the unread interval always uses the latest setter without re-binding.
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  useEffect(() => {
    getStaff().then(s => { if (aliveRef.current) setStaff(s); }).catch(() => {});
    // Hydrate from cached snapshot for instant first paint. Background refresh updates it.
    SecureStore.getItemAsync(STORAGE.DASHBOARD_SNAPSHOT).then(raw => {
      if (!raw || !aliveRef.current) return;
      try {
        const s = JSON.parse(raw) as {
          counts?: Record<BadgeKey, number>;
          cashToday?: number;
          botClients?: number;
        };
        if (s.counts) setCounts(c => ({ ...c, ...s.counts }));
        if (typeof s.cashToday === 'number') setCashToday(s.cashToday);
        if (typeof s.botClients === 'number') setBotClients(s.botClients);
      } catch { /* ignore stale snapshot */ }
    }).catch(() => {});
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const unread = await fetchUnreadCount();
      if (aliveRef.current) setCounts(c => ({ ...c, unread }));
    } catch { /* keep prior value */ }
  }, []);

  const loadAll = useCallback(async () => {
    // Best-effort fan-out; each failure collapses to 0 / prior value so the dashboard never blocks.
    const results = await Promise.allSettled([
      fetchShipmentCount(),
      fetchNewOrdersCount(),
      fetchUnreadCount(),
      fetchPendingAuditsCount(),
      Promise.all(PENDING_LOCATIONS.map(l => listPendingMovements(l).catch(() => [])))
        .then(arr => arr.reduce((s, a) => s + a.length, 0)),
      fetchCashToday(),
      fetchBotClientsCount(),
    ]);
    if (!aliveRef.current) return;
    const val = (i: number, fallback = 0) =>
      results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<number>).value : fallback;

    const nextCounts = {
      shipments: val(0),
      newOrders: val(1),
      unread: val(2),
      pendingAudits: val(3),
      pendingMovements: val(4),
    };
    const nextCash = val(5);
    const nextBot = val(6);
    setCounts(nextCounts);
    setCashToday(nextCash);
    setBotClients(nextBot);
    // Persist fresh snapshot so next launch paints with real numbers immediately.
    SecureStore.setItemAsync(
      STORAGE.DASHBOARD_SNAPSHOT,
      JSON.stringify({ counts: nextCounts, cashToday: nextCash, botClients: nextBot }),
    ).catch(() => {});
  }, []);

  // Refresh every time tab regains focus.
  useFocusEffect(useCallback(() => {
    loadAll();
    // Poll unread while the tab is focused; teardown on blur.
    const id = setInterval(refreshUnread, UNREAD_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadAll, refreshUnread]));

  const isAdmin = staff?.role === 'admin';
  const sections = staff?.visible_sections ?? [];
  const canSee = useCallback((section: string) => {
    if (isAdmin) return true;
    if (sections.length === 0) return true;
    return sections.includes(section);
  }, [isAdmin, sections]);

  const visibleMain = useMemo(
    () => MAIN_ITEMS.filter(i => canSee(i.section)),
    [canSee],
  );
  const visibleSecondary = useMemo(
    () => SECONDARY_ITEMS.filter(i => (!i.adminOnly || isAdmin) && canSee(i.section)),
    [canSee, isAdmin],
  );

  // Tab routes (sibling tabs in the same group) need `navigate` to switch instead of pushing
  // onto the current tab's stack. Stack screens use `push` so the system back button works.
  const navigate = (href: ActionHref) => {
    if (href === '/orders' || href === '/chat') router.navigate(href as never);
    else router.push(href as never);
  };
  const goMain = (href: ActionHref) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    navigate(href);
  };
  const goSecondary = (href: ActionHref) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    navigate(href);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <LinearGradient
              colors={[colors.brand, colors.brandDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.logo}
            >
              <Text style={styles.logoText}>D</Text>
            </LinearGradient>
            <View>
              <Text style={styles.appTitle}>Dezik Ops</Text>
              {staff?.name ? (
                <Text style={styles.appSubtitle} numberOfLines={1}>{staff.name}</Text>
              ) : null}
            </View>
          </View>
          {isAdmin ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>ADMIN</Text>
            </View>
          ) : null}
        </View>

        {/* Main grid 2×2 */}
        <View style={styles.grid}>
          {visibleMain.map(item => {
            const badge = item.badgeKey ? counts[item.badgeKey] : 0;
            const desc = item.href === '/cash' ? fmtCashLine(cashToday) : item.desc;
            return (
              <Pressable
                key={item.label}
                onPress={() => goMain(item.href)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}. ${desc}`}
                accessibilityHint={badge > 0 ? `Нових: ${badge}` : undefined}
                android_ripple={{ color: '#00000010', borderless: false }}
                style={({ pressed }) => [styles.mainCard, pressed && styles.mainCardPressed]}
              >
                <View style={[styles.iconBox, { backgroundColor: tintBg(item.color) }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>{desc}</Text>
                </View>
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{fmtBadge(badge)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {/* Secondary section (label + list grouped, internal 12px gap) */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ЩЕ</Text>
          <View style={styles.list}>
            {visibleSecondary.map((item, i) => {
              const badge = item.badgeKey ? counts[item.badgeKey] : 0;
              return (
                <Pressable
                  key={item.label}
                  onPress={() => goSecondary(item.href)}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityHint={badge > 0 ? `Очікують: ${badge}` : undefined}
                  android_ripple={{ color: '#00000008' }}
                  style={({ pressed }) => [
                    styles.listRow,
                    i > 0 && styles.listDivider,
                    pressed && styles.listRowPressed,
                  ]}
                >
                  <View style={styles.listIconBox}>
                    <Ionicons name={item.icon} size={18} color={colors.brand} />
                  </View>
                  <Text style={styles.listLabel}>{item.label}</Text>
                  {badge > 0 ? (
                    <View style={styles.listBadge}>
                      <Text style={styles.listBadgeText}>{fmtBadge(badge)}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color="#C5C9D1" />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Bot clients banner — admin-only, mirrors MainMenu */}
        {isAdmin && botClients > 0 ? (
          <Pressable
            onPress={() => goSecondary('/chat')}
            accessibilityRole="button"
            accessibilityLabel={`Клієнти в боті, ${botClients} активних чатів`}
            android_ripple={{ color: '#00000010' }}
            style={({ pressed }) => [pressed && styles.bannerPressed]}
          >
            <LinearGradient
              colors={['rgba(75,86,158,0.05)', 'rgba(75,86,158,0.10)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.botBanner}
            >
              <View style={styles.botBannerIcon}>
                <Ionicons name="people" size={20} color={colors.success} />
              </View>
              <View style={styles.botBannerBody}>
                <Text style={styles.botBannerTitle}>Клієнти в боті</Text>
                <Text style={styles.botBannerSub}>{botClients} активних чатів</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C5C9D1" />
            </LinearGradient>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles (pixel-matched to MainMenu in app/telegram/page.tsx) ─────────────
const SECTION_GAP = 24; // space-y-6
const GRID_GAP = 12; // gap-3
const CARD_RADIUS = 20;
const BORDER = '#F0F0F0';
const DIVIDER = '#F5F5F5';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: 16,
    paddingBottom: 48,
    gap: SECTION_GAP,
  },

  // Header — flex items-center justify-between, left has gap-3
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 12,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  logoText: { color: '#FFFFFF', fontWeight: '700', fontSize: 20 },
  appTitle: { fontSize: 17, fontWeight: '700', color: '#111827', lineHeight: 20 },
  appSubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  adminBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.brandTint,
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand,
    letterSpacing: 0.6,
  },

  // Grid 2×2 — grid-cols-2 gap-3
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  mainCard: {
    // Two cards per row with a 12-px gap between them.
    flexBasis: `${(100 - 4) / 2}%`,
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: BORDER,
    // Bot has a two-layer shadow; RN supports only one — pick the heavier layer.
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  mainCardPressed: { transform: [{ scale: 0.97 }], shadowOpacity: 0 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', lineHeight: 18 },
  cardSubtitle: { fontSize: 11, color: '#9CA3AF', lineHeight: 14 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', lineHeight: 13 },

  // Secondary section (label has 12-px gap to list; container has 24-px gap to neighbors)
  section: { gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    paddingHorizontal: 4,
  },
  list: {
    backgroundColor: '#FFFFFF',
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  listRowPressed: { backgroundColor: '#F8F8FA' },
  listDivider: { borderTopWidth: 1, borderTopColor: DIVIDER },
  listIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: '#111827' },
  listBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', lineHeight: 14 },

  // Bot clients banner
  bannerPressed: { transform: [{ scale: 0.98 }] },
  botBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(75,86,158,0.10)',
  },
  botBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: colors.successTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botBannerBody: { flex: 1, gap: 2 },
  botBannerTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  botBannerSub: { fontSize: 12, color: '#6B7280' },
});
