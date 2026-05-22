import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { clearToken, getStaff, Staff } from '@/lib/auth';
import { colors, radius, spacing, text } from '@/lib/theme';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Адміністратор',
  manager: 'Менеджер',
  operator: 'Оператор',
};

export default function ProfileScreen() {
  const [staff, setStaff] = useState<Staff | null>(null);

  useEffect(() => {
    getStaff().then(setStaff);
  }, []);

  const logout = () => {
    Alert.alert('Вийти?', 'Доведеться знову ввести код з бота.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Вийти',
        style: 'destructive',
        onPress: async () => {
          await clearToken();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <View style={styles.card}>
        <Field label="Імʼя" value={staff?.name} />
        <Field label="Роль" value={staff?.role ? (ROLE_LABELS[staff.role] ?? staff.role) : null} />
        {staff?.location && <Field label="Локація" value={staff.location} />}
      </View>

      <Pressable onPress={logout} style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}>
        <Text style={styles.logoutText}>Вийти</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  field: { gap: spacing.xs },
  label: { ...text.faint, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { ...text.body, fontWeight: '500' },
  logout: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  logoutPressed: { opacity: 0.6 },
  logoutText: { color: colors.danger, fontSize: 16, fontWeight: '700' },
});
