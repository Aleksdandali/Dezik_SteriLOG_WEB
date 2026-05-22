import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api, ApiError } from '@/lib/api';
import { setStaff, setToken, Staff } from '@/lib/auth';
import { colors, radius, spacing, text } from '@/lib/theme';

/**
 * Login by 6-digit code from @Dezik_OS_bot.
 *
 *   1. Staff opens chat with @Dezik_OS_bot and sends /login
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
      // Land on the dashboard (Головна) — same initialRouteName as (tabs)/_layout.
      router.replace('/(tabs)/create');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Невідома помилка';
      Alert.alert('Помилка входу', msg);
    } finally {
      setLoading(false);
    }
  };

  const disabled = loading || code.length !== 6;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Dezik Staff</Text>
          <Text style={styles.subtitle}>
            Відкрийте @Dezik_OS_bot і надішліть команду{' '}
            <Text style={styles.code}>/login</Text>, щоб отримати код
          </Text>

          <Pressable onPress={() => Linking.openURL('https://t.me/Dezik_OS_bot')} hitSlop={8}>
            <Text style={styles.link}>Відкрити бота →</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={code}
            onChangeText={t => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={colors.textFaint}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
          />

          <Pressable
            style={[styles.button, disabled && styles.buttonDisabled]}
            onPress={submit}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>{loading ? 'Перевіряємо…' : 'Увійти'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  title: { ...text.title, fontSize: 32 },
  subtitle: { ...text.body, color: colors.textMuted, lineHeight: 22 },
  code: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: colors.brandTint,
    color: colors.brandDark,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  link: { color: colors.brand, fontSize: 16, fontWeight: '600', marginTop: spacing.xs },
  input: {
    marginTop: spacing.xl,
    fontSize: 28,
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    color: colors.text,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '700' },
});
