import { useCallback, useEffect, useState } from 'react';
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
import {
  approveRequest,
  fetchTeam,
  LOCATION_LABELS,
  rejectRequest,
  STAFF_SECTIONS,
  updateStaff,
  type JoinRequest,
  type OpsLocation,
  type StaffRole,
  type TeamMember,
} from '@/lib/ops';
import { colors, radius, spacing, text } from '@/lib/theme';

const DEFAULT_SECTIONS = ['production', 'movement', 'warehouse'];

export default function TeamScreen() {
  const [staff, setStaff] = useState<TeamMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    role: StaffRole;
    location: OpsLocation | null;
    sections: string[];
  } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchTeam();
      setStaff(data.staff ?? []);
      setRequests(data.requests ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не вдалось завантажити';
      setError(msg.includes('Forbidden') ? 'Потрібна роль admin' : msg);
      setStaff([]);
      setRequests([]);
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

  const startEdit = (s: TeamMember) => {
    setApprovingId(null);
    setEditingId(s.id);
    setDraft({
      role: (s.role as StaffRole) ?? 'staff',
      location: (s.location as OpsLocation) ?? null,
      sections: s.visible_sections ?? [],
    });
  };

  const startApprove = (r: JoinRequest) => {
    setEditingId(null);
    setApprovingId(r.id);
    setDraft({ role: 'staff', location: null, sections: DEFAULT_SECTIONS });
  };

  const cancel = () => {
    setEditingId(null);
    setApprovingId(null);
    setDraft(null);
  };

  const toggleSection = (id: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      sections: draft.sections.includes(id)
        ? draft.sections.filter(x => x !== id)
        : [...draft.sections, id],
    });
  };

  const saveStaff = async (staffId: string) => {
    if (!draft) return;
    setBusyId(staffId);
    try {
      await updateStaff({
        staff_id: staffId,
        role: draft.role,
        location: draft.location,
        visible_sections: draft.sections,
      });
      cancel();
      await load();
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось зберегти');
    } finally {
      setBusyId(null);
    }
  };

  const deactivate = (s: TeamMember) => {
    Alert.alert('Деактивувати?', `${s.name} більше не зможе зайти.`, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Деактивувати',
        style: 'destructive',
        onPress: async () => {
          setBusyId(s.id);
          try {
            await updateStaff({ staff_id: s.id, active: false });
            await load();
          } catch (e) {
            Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const approve = async (r: JoinRequest) => {
    if (!draft) return;
    setBusyId(r.id);
    try {
      await approveRequest({
        request_id: r.id,
        role: draft.role,
        location: draft.location,
        visible_sections: draft.sections,
      });
      cancel();
      await load();
    } catch (e) {
      Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось');
    } finally {
      setBusyId(null);
    }
  };

  const reject = (r: JoinRequest) => {
    Alert.alert('Відхилити заявку?', r.name, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Відхилити',
        style: 'destructive',
        onPress: async () => {
          setBusyId(r.id);
          try {
            await rejectRequest(r.id);
            await load();
          } catch (e) {
            Alert.alert('Помилка', e instanceof Error ? e.message : 'Не вдалось');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Команда',
          headerTintColor: colors.brand,
        }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error ? (
          <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
        ) : (
          <>
            {requests.length > 0 && (
              <View style={{ gap: spacing.sm }}>
                <Text style={[styles.sectionTitle, { color: colors.warning }]}>
                  Нові заявки ({requests.length})
                </Text>
                {requests.map(r => (
                  <View key={r.id} style={[styles.card, styles.cardPending]}>
                    <Text style={styles.title}>{r.name}</Text>
                    <Text style={styles.meta}>
                      {r.username ? `@${r.username} · ` : ''}ID {r.telegram_id}
                    </Text>

                    {approvingId === r.id && draft ? (
                      <Editor
                        draft={draft}
                        onRole={role => setDraft({ ...draft, role })}
                        onLocation={location => setDraft({ ...draft, location })}
                        onToggleSection={toggleSection}
                      />
                    ) : null}

                    <View style={styles.row}>
                      {approvingId === r.id ? (
                        <>
                          <Pressable
                            style={[styles.btn, styles.btnGhost]}
                            onPress={cancel}
                            disabled={busyId === r.id}
                          >
                            <Text style={styles.btnGhostText}>Скасувати</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.btn, styles.btnPrimary, busyId === r.id && styles.btnDisabled]}
                            onPress={() => approve(r)}
                            disabled={busyId === r.id}
                          >
                            {busyId === r.id ? (
                              <ActivityIndicator color={colors.card} />
                            ) : (
                              <Text style={styles.btnPrimaryText}>Створити</Text>
                            )}
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable
                            style={[styles.btn, styles.btnReject]}
                            onPress={() => reject(r)}
                            disabled={busyId === r.id}
                          >
                            <Text style={styles.btnRejectText}>Відхилити</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.btn, styles.btnPrimary]}
                            onPress={() => startApprove(r)}
                          >
                            <Text style={styles.btnPrimaryText}>Налаштувати</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ gap: spacing.sm }}>
              <Text style={styles.sectionTitle}>Працівники ({staff.length})</Text>
              {staff.map(s => {
                const editing = editingId === s.id;
                return (
                  <View key={s.id} style={styles.card}>
                    <Pressable
                      onPress={() => (editing ? cancel() : startEdit(s))}
                      style={styles.cardHeader}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.title}>{s.name}</Text>
                        <Text style={styles.meta}>
                          {s.role === 'admin' ? '👑 Адмін' : '👤 Працівник'}
                          {s.location ? ` · ${LOCATION_LABELS[s.location as OpsLocation] ?? s.location}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>{editing ? '▾' : '›'}</Text>
                    </Pressable>

                    {editing && draft && (
                      <>
                        <Editor
                          draft={draft}
                          onRole={role => setDraft({ ...draft, role })}
                          onLocation={location => setDraft({ ...draft, location })}
                          onToggleSection={toggleSection}
                        />
                        <View style={styles.row}>
                          <Pressable style={[styles.btn, styles.btnReject]} onPress={() => deactivate(s)}>
                            <Text style={styles.btnRejectText}>Деактивувати</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.btn, styles.btnPrimary, busyId === s.id && styles.btnDisabled]}
                            onPress={() => saveStaff(s.id)}
                            disabled={busyId === s.id}
                          >
                            {busyId === s.id ? (
                              <ActivityIndicator color={colors.card} />
                            ) : (
                              <Text style={styles.btnPrimaryText}>Зберегти</Text>
                            )}
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Editor({
  draft,
  onRole,
  onLocation,
  onToggleSection,
}: {
  draft: { role: StaffRole; location: OpsLocation | null; sections: string[] };
  onRole: (r: StaffRole) => void;
  onLocation: (l: OpsLocation | null) => void;
  onToggleSection: (id: string) => void;
}) {
  const locations = Object.keys(LOCATION_LABELS) as OpsLocation[];
  return (
    <View style={styles.editor}>
      <Text style={styles.fieldLabel}>Роль</Text>
      <View style={styles.chips}>
        {(['staff', 'admin'] as StaffRole[]).map(r => {
          const active = draft.role === r;
          return (
            <Pressable
              key={r}
              onPress={() => onRole(r)}
              style={[styles.chip, styles.chipWide, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {r === 'admin' ? 'Адмін' : 'Працівник'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Локація</Text>
      <View style={styles.chips}>
        <Pressable
          onPress={() => onLocation(null)}
          style={[styles.chip, !draft.location && styles.chipActive]}
        >
          <Text style={[styles.chipText, !draft.location && styles.chipTextActive]}>Без</Text>
        </Pressable>
        {locations.map(loc => {
          const active = draft.location === loc;
          return (
            <Pressable
              key={loc}
              onPress={() => onLocation(loc)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {LOCATION_LABELS[loc]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Що бачить</Text>
      <View style={styles.chips}>
        {STAFF_SECTIONS.map(sec => {
          const active = draft.sections.includes(sec.id);
          return (
            <Pressable
              key={sec.id}
              onPress={() => onToggleSection(sec.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{sec.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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

  sectionTitle: {
    ...text.faint,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.xs,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardPending: { borderWidth: 1, borderColor: '#FED7AA' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { ...text.bodyStrong },
  meta: { ...text.meta, marginTop: 2 },
  chevron: { fontSize: 18, color: colors.textFaint, fontWeight: '600' },

  editor: { gap: spacing.sm },
  fieldLabel: { ...text.meta, fontWeight: '600', marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.brandTint,
  },
  chipWide: { flex: 1, alignItems: 'center' },
  chipActive: { backgroundColor: colors.brand },
  chipText: { fontSize: 13, color: colors.brandDark, fontWeight: '500' },
  chipTextActive: { color: colors.card, fontWeight: '700' },

  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnGhost: { backgroundColor: colors.brandTint },
  btnGhostText: { color: colors.brandDark, fontSize: 14, fontWeight: '600' },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryText: { color: colors.card, fontSize: 14, fontWeight: '700' },
  btnReject: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA' },
  btnRejectText: { color: '#991B1B', fontSize: 14, fontWeight: '600' },
});
