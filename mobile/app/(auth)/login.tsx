import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api, ApiError } from '@/lib/api';
import { setStaff, setToken, Staff } from '@/lib/auth';

/**
 * Login by 6-digit code from @dezik_ua_bot.
 *
 * Flow (to be implemented on backend — see README → "Backend gaps"):
 *   1. Staff opens chat with @dezik_ua_bot and sends /login
 *   2. Bot replies with a 6-digit code valid for ~5 min
 *   3. Staff enters the code here → POST /api/telegram/staff/login-code
 *   4. Backend verifies code + returns { token, staff }
 *   5. We persist token in SecureStore and proceed to the tabs
 */
export default function LoginScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (code.length !== 6) {
      Alert.alert('Код', 'Введіть 6-значний код з бота');
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ token: string; staff: Staff }>('/api/telegram/staff/login-code', {
        method: 'POST',
        body: { code },
      });
      await setToken(res.token);
      await setStaff(res.staff);
      router.replace('/(tabs)/orders');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Невідома помилка';
      Alert.alert('Помилка входу', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Dezik Staff</Text>
        <Text style={styles.subtitle}>
          Відкрийте @dezik_ua_bot і надішліть команду{' '}
          <Text style={styles.code}>/login</Text>, щоб отримати код
        </Text>

        <Pressable onPress={() => Linking.openURL('https://t.me/dezik_ua_bot')}>
          <Text style={styles.link}>Відкрити бота →</Text>
        </Pressable>

        <TextInput
          style={styles.input}
          value={code}
          onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        <Pressable
          style={[styles.button, (loading || code.length !== 6) && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading || code.length !== 6}
        >
          <Text style={styles.buttonText}>{loading ? 'Перевіряємо…' : 'Увійти'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 32, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#555', lineHeight: 22 },
  code: { fontFamily: 'Courier', backgroundColor: '#f3f3f3', paddingHorizontal: 6 },
  link: { color: '#0a84ff', fontSize: 16, marginTop: 8 },
  input: {
    marginTop: 32,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 16,
  },
  button: {
    marginTop: 16,
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
