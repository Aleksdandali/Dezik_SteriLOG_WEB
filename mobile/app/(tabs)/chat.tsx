import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';

type Conversation = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  last_message_at: string | null;
  unread_count: number | null;
};

export default function ChatScreen() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api<{ data: Conversation[] }>('/api/telegram/chat/conversations?status=open');
      setItems(res.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не вдалось завантажити');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={c => c.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        contentContainerStyle={items.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={<Text style={styles.empty}>Немає відкритих розмов</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.customer_name ?? item.customer_phone ?? '—'}</Text>
            {item.customer_phone && item.customer_name && (
              <Text style={styles.meta}>{item.customer_phone}</Text>
            )}
            {item.unread_count ? (
              <Text style={styles.unread}>{item.unread_count} нових</Text>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#888' },
  error: { color: '#b00', padding: 16, textAlign: 'center' },
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
  },
  name: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 13, color: '#666', marginTop: 2 },
  unread: { marginTop: 6, color: '#0a84ff', fontSize: 13, fontWeight: '600' },
});
