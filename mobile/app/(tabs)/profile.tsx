import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { clearToken, getStaff, Staff } from '@/lib/auth';

export default function ProfileScreen() {
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
    getStaff().then(setStaff);
  }, []);

  const logout = async () => {
    await clearToken();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.card}>
        <Text style={styles.label}>Імʼя</Text>
        <Text style={styles.value}>{staff?.name ?? '—'}</Text>
        <Text style={styles.label}>Роль</Text>
        <Text style={styles.value}>{staff?.role ?? '—'}</Text>
        {staff?.location && (
          <>
            <Text style={styles.label}>Локація</Text>
            <Text style={styles.value}>{staff.location}</Text>
          </>
        )}
      </View>

      <Pressable style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Вийти</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f8', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 12, color: '#888', marginTop: 8 },
  value: { fontSize: 16, fontWeight: '500' },
  logout: { marginTop: 24, alignItems: 'center', padding: 16 },
  logoutText: { color: '#b00', fontSize: 16, fontWeight: '600' },
});
