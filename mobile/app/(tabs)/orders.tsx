import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '@/lib/api';

type Order = {
  id: number;
  status_id: number;
  status_name: string;
  total: number;
  recipient: string | null;
  phone: string | null;
  city: string | null;
  ordered_at: string;
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await api<{ data: Order[] }>('/api/telegram/orders?status=1');
      setOrders(res.data ?? []);
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
        data={orders}
        keyExtractor={o => String(o.id)}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        contentContainerStyle={orders.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={<Text style={styles.empty}>Немає нових замовлень</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowHeader}>
              <Text style={styles.id}>#{item.id}</Text>
              <Text style={styles.total}>{Math.round(item.total)} ₴</Text>
            </View>
            <Text style={styles.name}>{item.recipient ?? '—'}</Text>
            {item.city && <Text style={styles.meta}>{item.city}</Text>}
            <Text style={styles.status}>{item.status_name}</Text>
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
    gap: 4,
  },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  id: { fontSize: 14, color: '#888' },
  total: { fontSize: 16, fontWeight: '600' },
  name: { fontSize: 16, fontWeight: '500' },
  meta: { fontSize: 13, color: '#666' },
  status: { fontSize: 12, color: '#444', marginTop: 4 },
});
