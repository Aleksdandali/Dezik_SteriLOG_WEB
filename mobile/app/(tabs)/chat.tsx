import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ApiError } from '@/lib/api';
import { listConversations, cacheConversation, type ChatConversation } from '@/lib/chat';
import { colors, radius, spacing, text } from '@/lib/theme';

export default function ChatScreen() {
  const [items, setItems] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await listConversations('open');
      data.forEach(cacheConversation);
      setItems(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалось завантажити');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const openChat = (c: ChatConversation) => {
    cacheConversation(c);
    router.push({ pathname: '/chat/[id]', params: { id: c.id } });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={c => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={<Text style={styles.empty}>Немає відкритих розмов</Text>}
        renderItem={({ item }) => {
          const title = item.customer_name ?? item.customer_phone ?? '—';
          const avatar = (item.customer_name ?? item.customer_phone ?? '?')[0]?.toUpperCase();
          return (
            <Pressable
              onPress={() => openChat(item)}
              accessibilityRole="button"
              accessibilityLabel={`Чат з ${title}${item.unread_by_manager > 0 ? `, ${item.unread_by_manager} непрочитаних` : ''}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{avatar}</Text>
              </View>
              <View style={styles.body}>
                <View style={styles.bodyTop}>
                  <Text style={styles.name} numberOfLines={1}>{title}</Text>
                  {item.last_message_at && (
                    <Text style={styles.time}>
                      {new Date(item.last_message_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                <View style={styles.bodyBottom}>
                  <Text style={styles.preview} numberOfLines={1}>
                    {item.last_message_preview ?? '—'}
                  </Text>
                  {item.unread_by_manager > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread_by_manager}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingVertical: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 15 },
  error: { color: colors.danger, padding: spacing.lg, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
  },
  rowPressed: { opacity: 0.6 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.brandTint,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.brandDark, fontSize: 17, fontWeight: '700' },
  body: { flex: 1, gap: 2 },
  bodyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bodyBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  name: { ...text.bodyStrong, flex: 1 },
  time: { ...text.faint },
  preview: { ...text.meta, flex: 1 },
  unreadBadge: {
    backgroundColor: colors.brand,
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadText: { color: colors.card, fontSize: 11, fontWeight: '700' },
});
