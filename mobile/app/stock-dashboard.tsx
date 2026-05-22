import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fetchStock, type StockItem } from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

type StockCategory = 'finished' | 'raw';

type DashLoc = {
  id: 'malynovskogo' | 'afina_sklad' | 'dalnytska';
  icon: keyof typeof Ionicons.glyphMap;
  name: string;
  hasRaw: boolean;
};

// Mirrors DASH_LOCS in app/telegram/page.tsx (`Залишки` view).
const DASH_LOCS: DashLoc[] = [
  { id: 'malynovskogo', icon: 'business', name: 'Маліновського', hasRaw: true },
  { id: 'afina_sklad', icon: 'archive', name: 'Афіна склад', hasRaw: false },
  { id: 'dalnytska', icon: 'flask', name: 'Дальницька', hasRaw: true },
];

type Level = 'good' | 'low' | 'critical';
const LEVEL_COLOR: Record<Level, { bg: string; text: string; dot: string }> = {
  good: { bg: '#D1FAE5', text: '#059669', dot: '#10B981' },
  low: { bg: '#FEF3C7', text: '#D97706', dot: '#F59E0B' },
  critical: { bg: '#FEE2E2', text: '#DC2626', dot: '#EF4444' },
};

// Matches bot's stockLevel(qty, name).
function stockLevel(qty: number, name: string): Level {
  if (qty <= 0) return 'critical';
  const isBag = name.includes('×') || name.includes('x');
  const crit = isBag ? 5 : 3;
  const low = isBag ? 20 : 10;
  if (qty <= crit) return 'critical';
  if (qty <= low) return 'low';
  return 'good';
}

type LocSnap = {
  items: StockItem[];
  source: string;
  lastAudit: string | null;
  loading: boolean;
};

export default function StockDashboardScreen() {
  const [cat, setCat] = useState<StockCategory>('finished');
  const [search, setSearch] = useState('');
  const [expandedLoc, setExpandedLoc] = useState<string | null>(null);
  const [locData, setLocData] = useState<Record<string, LocSnap>>(() => {
    const init: Record<string, LocSnap> = {};
    DASH_LOCS.forEach(l => { init[l.id] = { items: [], source: '', lastAudit: null, loading: true }; });
    return init;
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const results = await Promise.all(DASH_LOCS.map(async l => {
      try {
        const r = await fetchStock(l.id);
        return { id: l.id, items: r.data ?? [], source: r.source ?? '', lastAudit: r.lastAudit?.date ?? null };
      } catch {
        return { id: l.id, items: [], source: '', lastAudit: null };
      }
    }));
    const next: Record<string, LocSnap> = {};
    results.forEach(r => { next[r.id] = { items: r.items, source: r.source, lastAudit: r.lastAudit, loading: false }; });
    setLocData(next);
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filterItems = (items: StockItem[]) => {
    let f = items.filter(i => cat === 'raw' ? i.item_type === 'raw' : i.item_type !== 'raw');
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(i => i.name.toLowerCase().includes(q));
    }
    return f.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
  };

  const allLoading = Object.values(locData).some(d => d.loading);

  // Totals across all eligible locations (raw category excludes warehouses w/o raw).
  const { totals, counts } = useMemo(() => {
    const map: Record<string, StockItem> = {};
    DASH_LOCS.forEach(l => {
      if (cat === 'raw' && !l.hasRaw) return;
      filterItems(locData[l.id]?.items ?? []).forEach(item => {
        if (!map[item.name]) map[item.name] = { ...item, quantity: 0 };
        map[item.name].quantity += item.quantity;
      });
    });
    const t = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'uk'));
    const c: Record<Level, number> = { good: 0, low: 0, critical: 0 };
    t.forEach(i => { c[stockLevel(i.quantity, i.name)]++; });
    return { totals: t, counts: c };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, search, locData]);

  const toggleCat = (next: StockCategory) => {
    Haptics.selectionAsync().catch(() => {});
    setCat(next);
    setExpandedLoc(null);
  };

  const toggleLoc = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setExpandedLoc(expandedLoc === id ? null : id);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Залишки', headerTintColor: colors.brand }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Category toggle */}
        <View style={styles.toggleRow}>
          {([
            { id: 'finished' as const, icon: 'cube' as const, label: 'Готова продукція' },
            { id: 'raw' as const, icon: 'leaf' as const, label: 'Сировина' },
          ]).map(c => {
            const active = cat === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => toggleCat(c.id)}
                style={[styles.toggleBtn, active && styles.toggleBtnActive]}
              >
                <Ionicons name={c.icon} size={16} color={active ? colors.card : colors.brandDark} />
                <Text style={[styles.toggleText, active && styles.toggleTextActive]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search */}
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            placeholder="Пошук..."
            placeholderTextColor="#C5C9D1"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        {allLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.centerText}>Завантаження...</Text>
          </View>
        ) : (
          <>
            {/* Summary */}
            <View style={styles.summaryRow}>
              {([
                { k: 'good' as const, label: 'Норма' },
                { k: 'low' as const, label: 'Мало' },
                { k: 'critical' as const, label: 'Критично' },
              ]).map(s => (
                <View key={s.k} style={styles.summaryCard}>
                  <View style={[styles.summaryDotBox, { backgroundColor: LEVEL_COLOR[s.k].bg }]}>
                    <View style={[styles.summaryDot, { backgroundColor: LEVEL_COLOR[s.k].dot }]} />
                  </View>
                  <Text style={styles.summaryCount}>{counts[s.k]}</Text>
                  <Text style={styles.summaryLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Totals */}
            {totals.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>Загалом</Text>
                <View style={styles.list}>
                  {totals.map((item, i) => {
                    const lv = stockLevel(item.quantity, item.name);
                    const st = LEVEL_COLOR[lv];
                    return (
                      <View
                        key={item.name}
                        style={[styles.totalRow, i > 0 && styles.rowDivider]}
                      >
                        <View style={styles.rowLeft}>
                          <View style={[styles.itemDot, { backgroundColor: st.dot }]} />
                          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                        </View>
                        <View style={styles.qtyWrap}>
                          <View style={[styles.qtyPill, { backgroundColor: st.bg }]}>
                            <Text style={[styles.qtyPillText, { color: st.text }]}>{item.quantity}</Text>
                          </View>
                          <Text style={styles.itemUnit}>{item.unit}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Per location */}
            <View>
              <Text style={styles.sectionLabel}>По локаціях</Text>
              <View style={{ gap: 8 }}>
                {DASH_LOCS.filter(l => cat !== 'raw' || l.hasRaw).map(l => {
                  const d = locData[l.id];
                  const filtered = filterItems(d?.items ?? []);
                  const isExp = expandedLoc === l.id;
                  const lCounts: Record<Level, number> = { good: 0, low: 0, critical: 0 };
                  filtered.forEach(i => { lCounts[stockLevel(i.quantity, i.name)]++; });

                  return (
                    <View key={l.id}>
                      <Pressable
                        onPress={() => toggleLoc(l.id)}
                        android_ripple={{ color: '#00000010' }}
                        style={({ pressed }) => [styles.locCard, pressed && styles.locCardPressed]}
                      >
                        <View style={styles.locIcon}>
                          <Ionicons name={l.icon} size={18} color={colors.brand} />
                        </View>
                        <View style={styles.locBody}>
                          <Text style={styles.locName}>{l.name}</Text>
                          <View style={styles.locMetaRow}>
                            {d?.loading ? (
                              <ActivityIndicator size="small" color={colors.brand} />
                            ) : filtered.length === 0 ? (
                              <Text style={styles.locMetaFaint}>Немає даних</Text>
                            ) : (
                              <>
                                <Text style={styles.locMetaCount}>{filtered.length} поз.</Text>
                                {lCounts.critical > 0 && (
                                  <View style={styles.locMetaBadge}>
                                    <View style={[styles.miniDot, { backgroundColor: LEVEL_COLOR.critical.dot }]} />
                                    <Text style={[styles.miniBadgeText, { color: LEVEL_COLOR.critical.text }]}>{lCounts.critical}</Text>
                                  </View>
                                )}
                                {lCounts.low > 0 && (
                                  <View style={styles.locMetaBadge}>
                                    <View style={[styles.miniDot, { backgroundColor: LEVEL_COLOR.low.dot }]} />
                                    <Text style={[styles.miniBadgeText, { color: LEVEL_COLOR.low.text }]}>{lCounts.low}</Text>
                                  </View>
                                )}
                              </>
                            )}
                          </View>
                        </View>
                        <Ionicons
                          name={isExp ? 'chevron-down' : 'chevron-forward'}
                          size={18}
                          color="#C5C9D1"
                        />
                      </Pressable>

                      {isExp && (
                        <View style={[styles.list, { marginTop: 4 }]}>
                          <View style={styles.locSourceBar}>
                            <Text style={styles.locSourceText}>
                              {d?.source === 'keycrm'
                                ? 'KeyCRM'
                                : d?.source === 'production'
                                ? 'Виробництво (live)'
                                : d?.lastAudit
                                ? `Переоблік: ${d.lastAudit}`
                                : 'Дані переобліку'}
                            </Text>
                          </View>
                          {filtered.length === 0 ? (
                            <Text style={styles.emptyInList}>{search ? 'Не знайдено' : 'Немає даних'}</Text>
                          ) : (
                            filtered.map((item, i) => {
                              const lv = stockLevel(item.quantity, item.name);
                              const st = LEVEL_COLOR[lv];
                              return (
                                <View
                                  key={`${item.name}-${i}`}
                                  style={[styles.itemRow, i > 0 && styles.rowDivider]}
                                >
                                  <View style={styles.rowLeft}>
                                    <View style={[styles.itemDot, { backgroundColor: st.dot }]} />
                                    <Text style={styles.itemNameSm} numberOfLines={1}>{item.name}</Text>
                                  </View>
                                  <View style={styles.qtyWrap}>
                                    <Text style={[styles.itemQty, { color: st.text }]}>{item.quantity}</Text>
                                    <Text style={styles.itemUnitSm}>{item.unit}</Text>
                                  </View>
                                </View>
                              );
                            })
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {totals.length === 0 && (
              <View style={styles.empty}>
                <Ionicons
                  name={search ? 'search' : 'cube-outline'}
                  size={32}
                  color={colors.textFaint}
                />
                <Text style={styles.emptyTitle}>{search ? 'Не знайдено' : 'Немає даних'}</Text>
                <Text style={styles.emptySub}>{search ? 'Спробуйте інший запит' : 'Зробіть переоблік'}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: 16, paddingBottom: spacing.xxl * 2 },

  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
    shadowColor: colors.brand,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  toggleText: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
  toggleTextActive: { color: colors.card },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 },

  center: { paddingVertical: spacing.xxl * 2, alignItems: 'center', gap: 8 },
  centerText: { ...text.faint },

  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  summaryDotBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDot: { width: 10, height: 10, borderRadius: 5 },
  summaryCount: { fontSize: 18, fontWeight: '700', color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  list: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  itemDot: { width: 8, height: 8, borderRadius: 4 },
  itemName: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.text },
  itemNameSm: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.text },
  qtyWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  qtyPillText: { fontSize: 13, fontWeight: '700' },
  itemQty: { fontSize: 15, fontWeight: '700' },
  itemUnit: { fontSize: 12, color: colors.textMuted, width: 24 },
  // 11pt minimum for metadata; textMuted for AA contrast on white.
  itemUnitSm: { fontSize: 11, color: colors.textMuted },

  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  locCardPressed: { transform: [{ scale: 0.98 }] },
  locIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locBody: { flex: 1, gap: 2 },
  locName: { fontSize: 14, fontWeight: '700', color: colors.text },
  locMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  locMetaCount: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  locMetaFaint: { fontSize: 12, color: colors.textFaint },
  locMetaBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  miniDot: { width: 6, height: 6, borderRadius: 3 },
  miniBadgeText: { fontSize: 11, fontWeight: '700' },

  locSourceBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  locSourceText: { fontSize: 11, color: colors.textFaint },
  emptyInList: { paddingVertical: 18, textAlign: 'center', fontSize: 13, color: colors.textFaint },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textFaint },
});
