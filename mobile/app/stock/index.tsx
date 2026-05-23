import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FinishedProductAudit, { type AuditSubmitItem } from '@/components/FinishedProductAudit';
import ShipmentCard from '@/components/ShipmentCard';
import { getStaff, type Staff } from '@/lib/auth';
import {
  createAudit,
  fetchStock,
  listAudits,
  listPendingMovements,
  LOCATION_LABELS,
  reviewAudit,
  type AuditEntry,
  type OpsLocation,
  type PendingMovement,
  type StockData,
  type StockItem,
} from '@/lib/ops';
import { useOpsEvent } from '@/lib/realtime';
import { canReviewAudit, getAuditBadge } from '@/lib/audit-status';
import { colors, radius, spacing, text } from '@/lib/theme';

type WarehouseTab = 'incoming' | 'stock' | 'audit';
type AuditSubTab = 'new' | 'archive';
type AuditType = 'raw' | 'finished';

const WAREHOUSES: { id: OpsLocation; icon: string; hasRaw: boolean }[] = [
  { id: 'malynovskogo', icon: '🏭', hasRaw: true  },
  { id: 'afina_sklad',  icon: '🏪', hasRaw: false },
  { id: 'dalnytska',    icon: '🏭', hasRaw: true  },
];

const SOURCE_LABEL: Record<string, string> = {
  keycrm: 'KeyCRM',
  audit: 'Останній переоблік',
  production: 'Виробництво (live)',
};

// Status badges and review-permission live in mobile/lib/audit-status.ts —
// shared with /audit/queue so labels and colors cannot drift.

// ───────────────────────────────────────────────────────
// Top-level screen — 3-level navigation mirroring the Telegram bot.
//   L1: warehouse picker
//   L2: 3 tabs (Вхідні / Залишки / Переоблік) for the chosen warehouse
//   L3 (audit only): subtabs Новий / Архів
// ───────────────────────────────────────────────────────
export default function StockScreen() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [selectedLoc, setSelectedLoc] = useState<OpsLocation | null>(null);
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const pendingLoadedRef = useRef(false);

  useEffect(() => { getStaff().then(setStaff); }, []);

  const loadPendingCounts = useCallback(async () => {
    const counts: Record<string, number> = {};
    for (const wh of WAREHOUSES) {
      try {
        const list = await listPendingMovements(wh.id);
        counts[wh.id] = list.length;
      } catch {
        counts[wh.id] = 0;
      }
    }
    setPendingCounts(counts);
  }, []);

  // Per-warehouse pending counts shown as badges on the picker. Loaded once
  // per session — refresh happens when the user re-enters a warehouse, or
  // when realtime events arrive (see useOpsEvent below).
  useEffect(() => {
    if (selectedLoc || pendingLoadedRef.current) return;
    pendingLoadedRef.current = true;
    loadPendingCounts();
  }, [selectedLoc, loadPendingCounts]);

  // Live badges: refresh counts whenever a movement is created/confirmed.
  useOpsEvent('movement.pending',   () => { if (!selectedLoc) loadPendingCounts(); });
  useOpsEvent('movement.confirmed', () => { if (!selectedLoc) loadPendingCounts(); });

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ title: 'Склад', headerTintColor: colors.brand }} />
      {!selectedLoc ? (
        <LocationPicker
          pendingCounts={pendingCounts}
          onPick={setSelectedLoc}
        />
      ) : (
        <WarehouseDetail
          staff={staff}
          location={selectedLoc}
          onBack={() => {
            setSelectedLoc(null);
            // Force reload of pending counts when returning to the picker.
            pendingLoadedRef.current = false;
          }}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Level 1: warehouse picker ─────────────────────────
function LocationPicker({
  pendingCounts,
  onPick,
}: {
  pendingCounts: Record<string, number>;
  onPick: (loc: OpsLocation) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.h1}>📋 Склад</Text>
      <Text style={styles.h1Sub}>Оберіть локацію</Text>
      <View style={styles.cardList}>
        {WAREHOUSES.map(wh => {
          const count = pendingCounts[wh.id] ?? 0;
          return (
            <Pressable
              key={wh.id}
              onPress={() => onPick(wh.id)}
              style={({ pressed }) => [styles.bigCard, pressed && styles.cardPressed]}
              accessibilityRole="button"
              accessibilityLabel={`${LOCATION_LABELS[wh.id]}${count > 0 ? `, ${count} очікують прийому` : ''}`}
            >
              <Text style={styles.bigIcon}>{wh.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bigName}>{LOCATION_LABELS[wh.id]}</Text>
                <Text style={styles.bigDesc}>
                  {wh.hasRaw ? 'Сировина + готова продукція' : 'Готова продукція'}
                </Text>
              </View>
              {count > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{count}</Text>
                </View>
              )}
              <Text style={styles.chev}>›</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Level 2: tabs for chosen warehouse ────────────────
function WarehouseDetail({
  staff,
  location,
  onBack,
}: {
  staff: Staff | null;
  location: OpsLocation;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<WarehouseTab>('incoming');
  const [pendingCount, setPendingCount] = useState(0);

  // Watch pending count to keep the tab label badge fresh.
  const refreshPendingCount = useCallback(async () => {
    try {
      const list = await listPendingMovements(location);
      setPendingCount(list.length);
    } catch {
      setPendingCount(0);
    }
  }, [location]);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  // Keep the per-tab badge in sync with realtime movement events.
  useOpsEvent('movement.pending',   () => refreshPendingCount());
  useOpsEvent('movement.confirmed', () => refreshPendingCount());

  const warehouse = WAREHOUSES.find(w => w.id === location);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.detailHeader}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Назад">
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.detailTitle}>
          {warehouse?.icon} {LOCATION_LABELS[location]}
        </Text>
      </View>

      <View style={styles.tabBar}>
        {(['incoming', 'stock', 'audit'] as WarehouseTab[]).map(t => {
          const label =
            t === 'incoming' ? `Вхідні${pendingCount > 0 ? ` (${pendingCount})` : ''}` :
            t === 'stock'    ? 'Залишки' :
                                'Переоблік';
          const active = tab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tabBtn, active && styles.tabBtnActive]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'incoming' && <IncomingTab location={location} onChange={refreshPendingCount} />}
      {tab === 'stock' && <StockTab location={location} />}
      {tab === 'audit' && <AuditTab location={location} staff={staff} />}
    </ScrollView>
  );
}

// ─── Tab: Вхідні (pending shipments) ───────────────────
// Mirrors the bot's Warehouse → Вхідні: pending movements grouped by
// shipment_id, each rendered as a ShipmentCard that handles qty edits +
// optional photo + POST /api/telegram/movements/confirm.
function IncomingTab({ location, onChange }: { location: OpsLocation; onChange: () => void }) {
  const [items, setItems] = useState<PendingMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await listPendingMovements(location));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setItems([]);
    }
  }, [location]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  // Live updates: new shipment to this location → reload list; any confirm → reload.
  useOpsEvent('movement.pending', payload => {
    if (payload?.to_location === location) load();
  });
  useOpsEvent('movement.confirmed', () => { load(); });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Group by shipment_id; standalone movements get a synthetic key so each
  // appears as its own card.
  const groups = (() => {
    const map = new Map<string, PendingMovement[]>();
    for (const m of items) {
      const key = m.shipment_id ?? `single:${m.id}`;
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  })();

  const onShipmentConfirmed = (key: string) => {
    setItems(prev => {
      const group = groups.find(g => g.key === key);
      if (!group) return prev;
      const ids = new Set(group.items.map(i => i.id));
      return prev.filter(m => !ids.has(m.id));
    });
    // Refresh the badge count in the parent tab bar.
    onChange();
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }
  if (error) {
    return <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>;
  }
  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>📭</Text>
        <Text style={styles.emptyTitle}>Немає вхідних</Text>
        <Text style={styles.emptySub}>Все підтверджено</Text>
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={{ gap: spacing.md }}
    >
      <Text style={styles.sectionLabel}>
        Очікують прийому ({groups.length} {groups.length === 1 ? 'накладна' : 'накладних'})
      </Text>
      {groups.map(g => (
        <ShipmentCard
          key={g.key}
          items={g.items}
          onConfirmed={() => onShipmentConfirmed(g.key)}
        />
      ))}
    </ScrollView>
  );
}

// ─── Tab: Залишки ──────────────────────────────────────
function StockTab({ location }: { location: OpsLocation }) {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await fetchStock(location)); }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Не вдалось завантажити');
      setData(null);
    }
  }, [location]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  // Stock is derived from confirmed movements + last approved audit, so any of
  // these events can change the displayed numbers.
  useOpsEvent('movement.confirmed', () => { load(); });
  useOpsEvent('audit.created',  payload => { if (payload?.location === location) load(); });
  useOpsEvent('audit.reviewed', () => { load(); });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (error)   return <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>;
  if (!data)   return null;

  const items = data.data ?? [];
  const finished = items.filter(i => i.item_type !== 'raw');
  const raw      = items.filter(i => i.item_type === 'raw');

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={styles.tabBody}
    >
      <View style={styles.sourceCard}>
        <Text style={styles.sourceLabel}>Джерело</Text>
        <Text style={styles.sourceValue}>{SOURCE_LABEL[data.source] ?? data.source}</Text>
        {data.lastAudit && (
          <Text style={styles.sourceMeta}>Останній переоблік: {data.lastAudit.date}</Text>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>Порожньо</Text>
          <Text style={styles.emptySub}>Зробіть переоблік або виробництво</Text>
        </View>
      ) : (
        <>
          {finished.length > 0 && <StockSection title="Готова продукція" items={finished} />}
          {raw.length > 0 && <StockSection title="Сировина" items={raw} />}
        </>
      )}
    </ScrollView>
  );
}

function StockSection({ title, items }: { title: string; items: StockItem[] }) {
  const sorted = [...items].sort((a, b) => {
    if ((a.quantity > 0) !== (b.quantity > 0)) return a.quantity > 0 ? -1 : 1;
    return b.quantity - a.quantity;
  });
  return (
    <View>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.itemList}>
        {sorted.map((item, idx) => {
          const low = item.quantity <= 0;
          return (
            <View
              key={`${item.name}-${idx}`}
              style={[styles.itemRow, idx !== sorted.length - 1 && styles.itemRowDivider]}
            >
              <Text style={styles.itemName}>{item.name}</Text>
              <View style={styles.itemQtyBox}>
                <Text style={[styles.itemQty, low && styles.itemQtyLow]}>{item.quantity}</Text>
                <Text style={styles.itemUnit}>{item.unit}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Tab: Переоблік ────────────────────────────────────
function AuditTab({ location, staff }: { location: OpsLocation; staff: Staff | null }) {
  const [subTab, setSubTab] = useState<AuditSubTab>('new');
  const warehouse = WAREHOUSES.find(w => w.id === location);
  const hasRaw = warehouse?.hasRaw ?? false;

  return (
    <View style={styles.tabBody}>
      <View style={styles.subTabBar}>
        {(['new', 'archive'] as AuditSubTab[]).map(t => {
          const active = subTab === t;
          return (
            <Pressable
              key={t}
              onPress={() => setSubTab(t)}
              style={[styles.subTab, active && styles.subTabActive]}
              accessibilityRole="button"
            >
              <Text style={[styles.subTabText, active && styles.subTabTextActive]}>
                {t === 'new' ? 'Новий' : 'Архів'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {subTab === 'new'
        ? <NewAuditPanel location={location} hasRaw={hasRaw} />
        : <AuditArchivePanel location={location} staff={staff} />}
    </View>
  );
}

function NewAuditPanel({ location, hasRaw }: { location: OpsLocation; hasRaw: boolean }) {
  // Locations without raw materials (Afina) skip the type picker.
  const [auditType, setAuditType] = useState<AuditType | null>(hasRaw ? null : 'finished');
  const [submitting, setSubmitting] = useState(false);
  const warehouseName = LOCATION_LABELS[location];

  const submit = async (items: AuditSubmitItem[]) => {
    setSubmitting(true);
    try {
      await createAudit({ location, items });
      Alert.alert('Готово', 'Переоблік збережено', [
        { text: 'OK', onPress: () => setAuditType(hasRaw ? null : 'finished') },
      ]);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось зберегти');
    } finally {
      setSubmitting(false);
    }
  };

  if (!auditType) {
    return (
      <View style={styles.typePicker}>
        <Text style={styles.todayDate}>
          {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.bigCard, pressed && styles.cardPressed]}
          onPress={() => setAuditType('raw')}
        >
          <Text style={styles.bigIcon}>🧱</Text>
          <Text style={styles.bigName}>Сировина</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.bigCard, pressed && styles.cardPressed]}
          onPress={() => setAuditType('finished')}
        >
          <Text style={styles.bigIcon}>📦</Text>
          <Text style={styles.bigName}>Готова продукція</Text>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FinishedProductAudit
      warehouseName={warehouseName}
      locationId={location}
      itemType={auditType}
      submitting={submitting}
      onSubmit={submit}
      onBack={() => setAuditType(hasRaw ? null : 'finished')}
    />
  );
}

function AuditArchivePanel({ location, staff }: { location: OpsLocation; staff: Staff | null }) {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewing, setViewing] = useState<AuditEntry | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await listAudits(location)); }
    catch { setItems([]); }
  }, [location]);

  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [load]);

  // Live: new audit for this location → prepend; review → update status badge.
  useOpsEvent('audit.created',  payload => { if (payload?.location === location) load(); });
  useOpsEvent('audit.reviewed', () => { load(); });

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const review = async (audit: AuditEntry, action: 'approve' | 'reject') => {
    setActionId(audit.id);
    try {
      await reviewAudit(audit.id, action);
      setItems(prev => prev.map(a =>
        a.id === audit.id ? { ...a, status: action === 'approve' ? 'approved' : 'rejected' } : a,
      ));
      setViewing(null);
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось оновити');
    } finally {
      setActionId(null);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;

  // Detail view ── matches bot's viewingAudit screen.
  if (viewing) {
    const itemsList = viewing.ops_inventory_audit_items ?? [];
    const canReview = canReviewAudit(viewing, staff);
    const acting = actionId === viewing.id;
    return (
      <View style={{ gap: spacing.md }}>
        <Pressable onPress={() => setViewing(null)} style={styles.backRow} accessibilityRole="button">
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backLabel}>Архів</Text>
        </Pressable>
        <View>
          <Text style={styles.detailTitle}>Переоблік</Text>
          <Text style={styles.detailMeta}>
            {new Date(viewing.audit_date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
            {' · '}{viewing.ops_staff?.name ?? ''}
            {' · '}{viewing.status === 'approved' ? '✅' : viewing.status === 'rejected' ? '❌' : '⏳'}
          </Text>
        </View>
        <View style={styles.itemList}>
          {itemsList.map((it, idx) => (
            <View
              key={idx}
              style={[styles.itemRow, idx !== itemsList.length - 1 && styles.itemRowDivider]}
            >
              <Text style={styles.itemName}>{it.name}</Text>
              <View style={styles.itemQtyBox}>
                <Text style={styles.itemQty}>{it.quantity}</Text>
                <Text style={styles.itemUnit}>{it.unit}</Text>
              </View>
            </View>
          ))}
        </View>
        {canReview && (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionBtn, styles.actionReject, acting && styles.actionDisabled]}
              onPress={() => review(viewing, 'reject')}
              disabled={acting}
              accessibilityRole="button"
              accessibilityLabel="Відхилити"
            >
              <Text style={styles.actionRejectText}>Відхилити ❌</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionApprove, acting && styles.actionDisabled]}
              onPress={() => review(viewing, 'approve')}
              disabled={acting}
              accessibilityRole="button"
              accessibilityLabel="Затвердити"
            >
              {acting ? (
                <ActivityIndicator color={colors.card} />
              ) : (
                <Text style={styles.actionApproveText}>Затвердити ✅</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyEmoji}>📭</Text>
        <Text style={styles.emptyTitle}>Немає переобліків</Text>
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      contentContainerStyle={{ gap: spacing.md }}
    >
      {items.map(a => {
        const count = a.ops_inventory_audit_items?.length ?? 0;
        const badge = getAuditBadge(a.status);
        return (
          <Pressable
            key={a.id}
            onPress={() => setViewing(a)}
            style={({ pressed }) => [styles.archiveCard, pressed && styles.cardPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Переоблік ${a.audit_date}, ${badge.label}`}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.archiveDate}>
                {new Date(a.audit_date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
              </Text>
              <Text style={styles.archiveMeta}>
                {a.ops_staff?.name ?? ''} · {count} позицій
              </Text>
              {a.delta_summary && (
                <Text style={[
                  styles.archiveDelta,
                  a.delta_summary.items_with_delta === 0
                    ? styles.archiveDeltaSuspicious
                    : a.delta_summary.largest_delta_pct >= 50
                    ? styles.archiveDeltaWarn
                    : undefined,
                ]}>
                  {a.delta_summary.items_with_delta === 0
                    ? '⚠️ Δ = 0 vs минулого переобліку'
                    : `Δ ${a.delta_summary.items_with_delta} поз. · max ${a.delta_summary.largest_delta_pct}%`}
                </Text>
              )}
            </View>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ─── Styles ────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },

  // L1
  h1: { ...text.title, paddingHorizontal: spacing.xs },
  h1Sub: { ...text.meta, paddingHorizontal: spacing.xs, marginTop: -spacing.sm },

  cardList: { gap: spacing.sm + 4 },
  bigCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.7 },
  bigIcon: { fontSize: 28 },
  bigName: { ...text.bodyStrong, flex: 1 },
  bigDesc: { ...text.meta, marginTop: 2 },
  chev: { fontSize: 24, color: colors.textFaint, fontWeight: '600' },

  countBadge: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: colors.card, fontSize: 13, fontWeight: '700' },

  // L2 header + tabs
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.brandTint,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 22, color: colors.brand, fontWeight: '700' },
  detailTitle: { ...text.heading, flex: 1 },
  detailMeta: { ...text.meta, marginTop: 2 },

  tabBar: { flexDirection: 'row', gap: spacing.sm },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
  tabTextActive: { color: colors.card },

  tabBody: { gap: spacing.md },

  // Source card (Залишки header)
  sourceCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  sourceLabel: { ...text.faint, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  sourceValue: { ...text.bodyStrong, color: colors.brand },
  sourceMeta:  { ...text.meta },

  sectionLabel: {
    ...text.meta,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
  },

  itemList: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemName: { ...text.body, flex: 1 },
  itemQtyBox: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  itemQty: { fontSize: 18, fontWeight: '700', color: colors.brand },
  itemQtyLow: { color: colors.danger },
  itemUnit: { ...text.faint },

  // Common
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

  // Incoming
  pendingCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.warningTint,
    gap: spacing.sm,
  },
  pendingFrom: { ...text.meta },
  pendingStrong: { color: colors.text, fontWeight: '700' },
  pendingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  pendingItemName: { ...text.body, flex: 1 },
  pendingItemQty: { ...text.bodyStrong, color: colors.brand },
  pendingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  pendingTotal: { ...text.meta, fontWeight: '700' },
  pendingConfirm: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  pendingConfirmPressed: { opacity: 0.85 },
  pendingConfirmText: { color: colors.card, fontSize: 13, fontWeight: '700' },

  // Audit subtabs + type picker
  subTabBar: { flexDirection: 'row', gap: spacing.sm },
  subTab: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  subTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  subTabText: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
  subTabTextActive: { color: colors.card },

  typePicker: { gap: spacing.sm + 4 },
  todayDate: {
    ...text.meta,
    textTransform: 'capitalize',
    paddingHorizontal: spacing.xs,
  },

  // Archive list
  archiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  archiveDate: { ...text.bodyStrong },
  archiveMeta: { ...text.meta, marginTop: 2 },
  archiveDelta: { ...text.meta, marginTop: 2, fontWeight: '500' },
  archiveDeltaSuspicious: { color: '#B45309' },
  archiveDeltaWarn: { color: '#B91C1C' },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // Audit detail (review)
  backRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  backLabel: { ...text.meta, color: colors.brand, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionReject: { backgroundColor: colors.dangerTint, borderWidth: 1, borderColor: colors.dangerBorder },
  actionRejectText: { color: colors.dangerText, fontSize: 14, fontWeight: '600' },
  actionApprove: { backgroundColor: colors.success },
  actionApproveText: { color: colors.card, fontSize: 14, fontWeight: '600' },
  actionDisabled: { opacity: 0.5 },
});
